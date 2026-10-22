/**
 * What `verify` builds on: the ceremony loaded from private copies and rooted in the pinned
 * announcement (SPEC §6.2), its staged inputs, and which circuits failed a prerequisite of the
 * expensive checks.
 */
import { join } from "node:path";
import {
  type CeremonyAnnouncement,
  checkInitAgainstAnnouncement,
  checkVerifyMode,
  type CircuitName,
  type InitRecord,
  type Transcript,
} from "@orbinum-ceremony/core";
import { layout, type Loaded, loadAnnouncement, loadInit, loadTranscript } from "../../artifacts";
import { errorMessage, type Stage } from "../../io";
import type { Report } from "../../ui";
import type { VerifyOptions } from "./options";
import { type StagedFiles, stageInputs } from "./staging";

/** Everything the check groups share. */
export interface VerifyContext {
  options: VerifyOptions;
  report: Report;
  stage: Stage;
  announcement: Loaded<CeremonyAnnouncement>;
  init: Loaded<InitRecord>;
  transcript: Transcript;
  files: StagedFiles;
  /**
   * Cheap checks a circuit failed (staging, r1cs, genesis, final record): its snarkjs and Rust
   * checks are then reported failed without running on input already known to be wrong.
   */
  failed: Map<CircuitName | "ptau", string[]>;
}

/** The staged ptau, or throws like `staged`. */
export const stagedPtau = (ctx: VerifyContext): string => {
  if (!ctx.files.ptau) throw new Error("ptau could not be staged");
  return ctx.files.ptau;
};

/** Records that `circuit` failed the check `id`. */
export const markFailed = (ctx: VerifyContext, circuit: CircuitName | "ptau", id: string) =>
  ctx.failed.set(circuit, [...(ctx.failed.get(circuit) ?? []), id]);

/**
 * Runs an expensive check only if its circuit (and the ptau) passed every prerequisite so far;
 * otherwise reports it failed and names what failed first.
 */
export async function attemptGated(
  ctx: VerifyContext,
  circuit: CircuitName,
  id: string,
  fn: () => Promise<string[] | void>,
): Promise<boolean> {
  const blocked = [...(ctx.failed.get("ptau") ?? []), ...(ctx.failed.get(circuit) ?? [])];
  if (blocked.length > 0) {
    ctx.report.fail(id, `not run: prerequisite failed (${blocked[0]})`);
    return false;
  }
  return ctx.report.attempt(id, fn);
}

/**
 * Loads the ceremony from private copies: ceremony.json must hash to the pin, announce the
 * expected network and match the verification mode, init.json must be the one it announces.
 * Returns undefined (with the failure reported) when nothing further can be trusted.
 */
export async function loadContext(
  options: VerifyOptions,
  report: Report,
  stage: Stage,
): Promise<VerifyContext | undefined> {
  const paths = layout(options.dir);
  const fatal = (id: string, error: unknown) => {
    report.fail(id, errorMessage(error));
    return undefined;
  };

  let announcement: Loaded<CeremonyAnnouncement>;
  try {
    announcement = await loadAnnouncement(
      options.dir,
      await stage.copy(paths.announcement, "ceremony.json"),
    );
  } catch (error) {
    return fatal("ceremony.json is a valid announcement", error);
  }
  if (announcement.sha256 !== options.announcementSha256) {
    report.fail("ceremony.json matches the pinned SHA-256", `found ${announcement.sha256}`);
    return undefined;
  }
  report.pass("ceremony.json matches the pinned SHA-256", announcement.value.ceremony_id);
  const { ceremony_id: id, network, circuits_source: src } = announcement.value;
  report.describe(`ceremony ${id} on ${network}; circuits ${src.repo} ${src.tag} @ ${src.commit}`);
  const expected = network === options.network ? [] : [`${network}, expected ${options.network}`];
  if (!report.expect("ceremony.json announces the expected network", expected, network)) {
    return undefined;
  }

  const mode = checkVerifyMode(announcement.value, options.local);
  if (!report.expect("verification mode matches the announced network", mode)) return undefined;

  let init: Loaded<InitRecord>;
  try {
    init = await loadInit(options.dir, await stage.copy(paths.init, "init.json"));
  } catch (error) {
    return fatal("init.json is valid", error);
  }
  report.expect(
    "init.json is the announced one (bytes, ceremony, circuits commit)",
    checkInitAgainstAnnouncement(announcement.value, init.value, init.sha256),
  );

  let transcript: Transcript;
  try {
    transcript = (
      await loadTranscript(options.dir, await stage.copy(paths.transcript, "transcript.json"))
    ).value;
  } catch (error) {
    return fatal("transcript.json is valid", error);
  }

  const failed = new Map<CircuitName | "ptau", string[]>();
  const files = await stageInputs(options.dir, options.ptau, init.value, report, stage);
  for (const c of init.value.circuits) {
    if (!files.finalVk.has(c.name)) failed.set(c.name, [`${c.name}: inputs are regular files`]);
  }
  if (!files.ptau) failed.set("ptau", ["ptau is a regular file"]);
  return { options, report, stage, announcement, init, transcript, files, failed };
}

/** A scratch directory inside the stage for builds (compiling, rebuilding the genesis). */
export const workDir = (ctx: VerifyContext) => join(ctx.stage.dir, "work");
