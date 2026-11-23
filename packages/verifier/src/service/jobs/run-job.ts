/**
 * One dispatched job (COORDINATOR §5): pins → object → SPEC §2.5 pipeline → attempt record →
 * report, within one deadline. Every failure of ours ends as an `infra` report; a 404 on the object
 * (a stale job) ends without one.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type JobSpec,
  publishedLogOf,
  REPORT_RESERVE_MS,
  reportOf,
  type VerificationResult,
  VERIFY_DEADLINE_MS,
  type VerifierReport,
} from "@orbinum-ceremony/core";
import { verifyUpload } from "../../pipeline";
import { redact } from "../../text";
import type { ServiceConfig } from "../config";
import { fetchObject, postReport } from "../coordinator";
import { ensurePinned, type Inputs } from "../inputs";
import { appendReportOutcome, writeRecord } from "./records";

/** A job's whole run, report included: the coordinator stops waiting after this. */
export const JOB_DEADLINE_MS = VERIFY_DEADLINE_MS;

/** What a job runs against. */
interface JobContext {
  config: ServiceConfig;
  inputs: Inputs;
}

/** The operator's paths in text that leaves the host, longest first. */
const privatePaths = (config: ServiceConfig) =>
  (
    [
      [config.ceremonyDir, "$CEREMONY_DIR"],
      [config.logDir, "$LOG_DIR"],
      [process.cwd(), "."],
    ] as const
  ).toSorted((a, b) => b[0].length - a[0].length);

const tag = (spec: JobSpec) => `job ${spec.job.seq}/${spec.job.circuit}/${spec.job.attempt}`;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Runs one job to its report; never throws. Its deadline runs from when it was dispatched
 * (`receivedAt`), as the coordinator's does from the upload: a job that waited out its time
 * behind another is skipped, its turn long judged by the coordinator.
 */
export async function runJob(
  ctx: JobContext,
  spec: JobSpec,
  receivedAt = Date.now(),
): Promise<void> {
  const { config, inputs } = ctx;
  const end = receivedAt + JOB_DEADLINE_MS;
  if (end - Date.now() <= REPORT_RESERVE_MS) {
    console.warn(`${tag(spec)}: its deadline passed while it waited; skipped`);
    return;
  }
  const deadline = AbortSignal.timeout(end - Date.now());
  const paths = privatePaths(config);
  const clean = (text: string) => redact(text, paths);
  const endpoint = { ...config, ceremonyId: inputs.init.ceremony_id };
  let work: string | undefined;
  let report: VerifierReport;
  let recorded = false;
  try {
    if (inputs.genesis[spec.job.circuit]?.sha256 !== spec.genesisSha256) {
      throw new Error(`no pinned genesis ${spec.genesisSha256} for ${spec.job.circuit}`);
    }
    await ensurePinned(inputs);
    // Read after the pin check: staging again moves the copies.
    const genesis = inputs.genesis[spec.job.circuit]?.path as string;
    work = await mkdtemp(join(tmpdir(), "orbinum-verifier-"));
    const zkey = join(work, "upload.zkey");
    // The download stops early enough to leave the report its time to reach the coordinator.
    const fetchBy = AbortSignal.timeout(Math.max(1, end - Date.now() - REPORT_RESERVE_MS));
    if (!(await fetchObject(endpoint, spec.job, spec.size, zkey, fetchBy))) {
      console.warn(`${tag(spec)}: the coordinator has no object (stale job, or a wrong URL)`);
      return;
    }
    const timeoutMs = Math.max(1, Math.min(config.timeoutMs, end - Date.now() - REPORT_RESERVE_MS));
    const run = await verifyUpload(
      // Our own download: failing to copy it is never the contributor's fault.
      { zkey, zkeyIsOurs: true, genesis, ptau: inputs.ptau },
      spec.claim,
      spec.head,
      { timeoutMs },
    );
    const verdict: VerificationResult =
      run.verdict.result === "valid" || !run.verdict.detail
        ? run.verdict
        : { ...run.verdict, detail: clean(run.verdict.detail) };
    report = reportOf(spec, verdict, run.accepted, run.log, config.version);
    await writeRecord(config.logDir, spec.job, verdict, run.ms, publishedLogOf(run.log));
    recorded = true;
  } catch (error) {
    const detail = clean(messageOf(error));
    console.error(`${tag(spec)}: ${detail}`);
    const verdict: VerificationResult = { result: "infra", detail };
    report = reportOf(spec, verdict, undefined, "", config.version);
    recorded = await writeRecord(config.logDir, spec.job, verdict, {}, "").then(
      () => true,
      (e: unknown) => (console.error(`${tag(spec)}: record: ${clean(messageOf(e))}`), false),
    );
  } finally {
    if (work) {
      await rm(work, { recursive: true, force: true }).catch((e: unknown) =>
        console.error(`${tag(spec)}: cleanup: ${clean(String(e))}`),
      );
    }
  }
  const outcome = await postReport(endpoint, report, deadline).then(
    () => "posted",
    (e: unknown) => {
      const why = clean(messageOf(e));
      console.error(`${tag(spec)}: report: ${why}`);
      return `not delivered: ${why}`;
    },
  );
  if (recorded) {
    await appendReportOutcome(config.logDir, spec.job, outcome).catch((e: unknown) =>
      console.error(`${tag(spec)}: record: ${clean(messageOf(e))}`),
    );
  }
}
