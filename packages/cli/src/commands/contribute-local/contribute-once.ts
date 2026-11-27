/**
 * One simulated contribution: a fresh random entropy extends a circuit's head, the verifier
 * pipeline judges the output exactly as the service would, and the record is built (not yet
 * chained); `at` is when the record says it was accepted.
 */
import { randomBytes } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import {
  buildContributionRecord,
  type CircuitName,
  circuitOf,
  createSha256,
  headOf,
  LOCAL_BUILD,
  LOCAL_VERIFIER,
  sha256Utf8,
  TOOLING,
} from "@orbinum-ceremony/core";
import { layout } from "../../artifacts";
import { ensureDir, hashFile, writeAtomic } from "../../io";
import type { ContributionMetrics } from "../../store";
import { contribute, verifyUpload } from "../../tools";
import type { Contribution, Step } from "./types";

const CLIENT = { name: "orbinum-ceremony-cli", version: "0.0.0", commit: LOCAL_BUILD };

export async function contributeOnce(
  { options, init, store, seq, contributor }: Step,
  circuit: CircuitName,
  at: () => Date,
): Promise<Contribution> {
  const paths = layout(options.dir);
  const pinned = circuitOf(init, circuit);
  const head = headOf(store.transcript.records, circuit, {
    sha256: pinned.genesis_sha256,
    csHash: pinned.cs_hash,
  });
  const index = head.index + 1;
  const input = paths.zkey(circuit, head.index);
  const output = paths.zkey(circuit, index);
  const log = paths.log(circuit, index);
  await ensureDir(paths.contributions(circuit));

  const start = performance.now();
  const clientHash = await contribute(input, output, contributor, randomBytes(32).toString("hex"));
  const contributeMs = Math.round(performance.now() - start);

  const claim = {
    inputSha256: await hashFile(input, createSha256()),
    outputSha256: await hashFile(output, createSha256()),
    contributionHash: clientHash,
  };
  const {
    verdict,
    accepted,
    log: text,
    ms,
  } = await verifyUpload(
    {
      zkey: output,
      genesis: paths.zkey(circuit, 0),
      ptau: options.ptau,
      ...(options.crossCheckR1cs ? { r1cs: paths.r1cs(circuit) } : {}),
    },
    claim,
    head,
  );
  if (verdict.result !== "valid" || !accepted) {
    await rm(output, { force: true });
    throw new Error(`${circuit} #${index}: ${JSON.stringify(verdict)}`);
  }
  await writeAtomic(log, text);

  const record = buildContributionRecord({
    ceremonyId: init.ceremony_id,
    seq,
    circuit,
    index,
    claimed: { ...claim, method: "cli", client: CLIENT },
    verified: {
      contributionHash: verdict.contributionHash,
      zkeyName: accepted.name,
      deltaAfter: accepted.deltaAfter,
      logSha256: sha256Utf8(text),
      verifierVersion: LOCAL_VERIFIER,
      snarkjsVersion: TOOLING.snarkjs,
    },
    contributor: null,
    at: at().toISOString(),
  });
  const metrics: ContributionMetrics = {
    bytes: (await stat(output)).size,
    ms: {
      contribute: contributeMs,
      precheck: ms.precheck,
      verify: ms.verify,
      ...(ms.verifyFromR1cs === undefined ? {} : { verify_from_r1cs: ms.verifyFromR1cs }),
    },
  };
  return { record, metrics, files: [output, log] };
}
