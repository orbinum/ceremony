/** One upload through SPEC §2.5: private copy, core's pre-checks, then snarkjs, bounded. */
import {
  type CurrentHead,
  genesisLayoutOf,
  precheckUpload,
  PTAU,
  type UploadClaim,
  type VerificationResult,
} from "@orbinum-ceremony/core";
import { assertRegularFile, createStage, readBytes } from "../files";
import { IsolationError } from "../isolate";
import { type LimitsOverride, verifyFromInit, verifyFromR1cs } from "../snarkjs";
import { errorMessage } from "../text";
import { classifyVerifierError } from "./classify";

/** The upload and the pinned inputs it is verified against. */
export interface UploadFiles {
  zkey: string;
  /**
   * The upload is a file this host wrote itself (the service's download): failing to copy it is
   * then the host's fault (`infra`), never the contributor's.
   */
  zkeyIsOurs?: boolean;
  /**
   * Our own inputs, pinned by the caller (SPEC §2.5). The pipeline only checks they are present
   * and readable: missing or unreadable is the host's fault (`infra`), never the contributor's.
   */
  genesis: string;
  ptau: string;
  /** When set, also runs the full verify from r1cs and requires the same verdict (cross-check). */
  r1cs?: string;
}

/** The verdict, the accepted entry's fields, the snarkjs log and timings. */
export interface UploadVerification {
  verdict: VerificationResult;
  /** Fields the transcript records for an accepted upload (SPEC §6.3). */
  accepted?: { deltaAfter: string; name: string };
  log: string;
  ms: { precheck: number; verify: number; verifyFromR1cs?: number };
}

type Ms = UploadVerification["ms"];

const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
  const start = performance.now();
  const value = await fn();
  return [value, Math.round(performance.now() - start)];
};

const NO_TIME: Ms = { precheck: 0, verify: 0 };

/** `infra`; a dead child's stderr goes to the log (kept on the host), never into the detail. */
const infra = (error: unknown, ms: Ms = NO_TIME, log = ""): UploadVerification => ({
  verdict: { result: "infra", detail: errorMessage(error) },
  log: error instanceof IsolationError && error.stderr ? error.stderr : log,
  ms,
});

const malformed = (detail: string, ms: Ms = NO_TIME): UploadVerification => ({
  verdict: { result: "rejected", reason: "malformed", detail },
  log: "",
  ms,
});

/**
 * A snarkjs throw: ours when it is a resource error or our own inputs went missing meanwhile
 * (never blamed on the upload), the file's otherwise.
 */
async function snarkjsFailure(
  error: unknown,
  what: string,
  ms: Ms,
  files: UploadFiles,
  copy: string,
): Promise<UploadVerification> {
  if (classifyVerifierError(error) === "infra") return infra(error, ms);
  try {
    await assertOwnInputs(files, copy);
  } catch (own) {
    return infra(own, ms);
  }
  return malformed(`${what}: ${errorMessage(error)}`, ms);
}

/**
 * Our own inputs are still there and readable, right before snarkjs reopens them, and so is our
 * staged copy of the upload once it exists: losing it (a tmp cleaner, a permission change) is the
 * host's fault, never the contributor's.
 */
async function assertOwnInputs(files: UploadFiles, copy?: string): Promise<void> {
  if (copy !== undefined) await assertRegularFile(copy);
  await assertRegularFile(files.genesis);
  await assertRegularFile(files.ptau, PTAU.sizeBytes);
  if (files.r1cs !== undefined) await assertRegularFile(files.r1cs);
}

/**
 * SPEC §2.5: one private copy of the upload, pure pre-checks from `core` on its bytes (including
 * the genesis' header and section sizes), then `zkvi` against the pinned genesis on that same
 * copy. `zkvi` is equivalent to verifying from r1cs because the genesis was built and verified
 * from r1cs + ptau at init and is reproducible (A1). snarkjs runs in a child process; `limits`
 * lowers its class bounds (e.g. to what is left of the service's deadline).
 */
export async function verifyUpload(
  files: UploadFiles,
  claim: UploadClaim,
  head: CurrentHead,
  limits?: LimitsOverride,
): Promise<UploadVerification> {
  let stage;
  let genesis;
  try {
    stage = await createStage("orbinum-upload-");
    // Our own pinned file: unreadable or unparseable is the host's fault, never the contributor's.
    genesis = genesisLayoutOf(await readBytes(files.genesis));
  } catch (error) {
    await stage?.cleanup();
    return infra(error);
  }
  try {
    let copy: string;
    try {
      copy = await stage.copy(files.zkey, "upload.zkey");
    } catch (error) {
      return files.zkeyIsOurs || classifyVerifierError(error) === "infra"
        ? infra(error)
        : malformed(errorMessage(error));
    }

    const [pre, precheckMs] = await timed(async () =>
      precheckUpload(await readBytes(copy), claim, head, genesis),
    );
    if (!pre.ok) {
      const { ok: _, ...verdict } = pre;
      return { verdict, log: "", ms: { precheck: precheckMs, verify: 0 } };
    }

    const ms: Ms = { precheck: precheckMs, verify: 0 };
    try {
      await assertOwnInputs(files);
    } catch (error) {
      return infra(error, ms);
    }

    let check;
    try {
      [check, ms.verify] = await timed(() =>
        verifyFromInit(files.genesis, files.ptau, copy, limits),
      );
    } catch (error) {
      return await snarkjsFailure(error, "snarkjs", ms, files, copy);
    }

    if (files.r1cs !== undefined) {
      const start = performance.now();
      let full;
      try {
        full = await verifyFromR1cs(files.r1cs, files.ptau, copy, limits);
      } catch (error) {
        ms.verifyFromR1cs = Math.round(performance.now() - start);
        return await snarkjsFailure(error, "snarkjs (from r1cs)", ms, files, copy);
      }
      ms.verifyFromR1cs = Math.round(performance.now() - start);
      if (full.ok !== check.ok) {
        const log = `${check.log}\n${full.log}`;
        return infra(new Error("zkvi and verify from r1cs disagree"), ms, log);
      }
    }

    if (!check.ok) {
      return { verdict: { result: "rejected", reason: "zkey-verify-failed" }, log: check.log, ms };
    }
    return {
      verdict: { result: "valid", index: pre.index, contributionHash: pre.contributionHash },
      accepted: { deltaAfter: pre.deltaAfter, name: pre.name },
      log: check.log,
      ms,
    };
  } catch (error) {
    return infra(error);
  } finally {
    await stage.cleanup();
  }
}
