/**
 * One circuit's final key, VK and vk_hash against the transcript (SPEC §2.6, §6.4), then the same
 * key re-verified by the independent verifier (`independent.ts`). snarkjs and Rust run only on a
 * circuit whose cheap checks all passed.
 */
import {
  type BeaconRecord,
  canonicalJson,
  checkDelta,
  checkFinalEntries,
  checkFinalRecord,
  createSha256,
  finalExpectationOf,
  type FinalRecord,
  type InitCircuit,
  readMpcParams,
} from "@orbinum-ceremony/core";
import { hashFile, readBytes, readJsonFile } from "../../../io";
import { exportVerificationKey, packedVkHash, verifyFromR1cs } from "../../../tools";
import { attemptGated, markFailed, stagedPtau, type VerifyContext } from "../context";
import { staged } from "../staging";
import { checkIndependently } from "./independent";

const MAX_VK_BYTES = 1024 * 1024;

/** Every check of one circuit's final key. */
export async function checkFinal(
  ctx: VerifyContext,
  beacon: BeaconRecord,
  c: InitCircuit,
): Promise<void> {
  const { report, options, transcript, announcement, files } = ctx;
  const limits = options.snarkjsLimits;
  const final: FinalRecord | undefined = transcript.finals.find((f) => f.circuit === c.name);
  if (!final) {
    report.fail(`${c.name}: final record`, "missing from transcript.finals");
    return;
  }
  const zkey = () => staged(files.finalZkey, c.name, "final zkey");
  const vkPath = () => staged(files.finalVk, c.name, "vk.json");

  const recordId = `${c.name}: final zkey matches the final record`;
  const recordOk = await report.attempt(recordId, async () => {
    const sha = (await hashFile(zkey(), createSha256())) === final.final_zkey_sha256;
    return [
      ...(sha ? [] : ["SHA-256"]),
      ...checkFinalRecord(final, transcript.records, c, announcement.value),
    ];
  });
  if (!recordOk) markFailed(ctx, c.name, recordId);

  await report.attempt(
    `${c.name}: final zkey embeds the recorded contributions + sealed beacon`,
    async () =>
      checkFinalEntries(
        readMpcParams(await readBytes(zkey())),
        finalExpectationOf(transcript.records, c, announcement.value, beacon),
      ),
  );

  await attemptGated(ctx, c.name, `${c.name}: final zkey verifies from r1cs + ptau`, async () => {
    const r1cs = staged(files.r1cs, c.name, "r1cs");
    const entries = readMpcParams(await readBytes(zkey())).entries.length;
    const res = await verifyFromR1cs(r1cs, stagedPtau(ctx), zkey(), limits, entries);
    return res.ok ? [] : ["snarkjs verification failed"];
  });

  await attemptGated(
    ctx,
    c.name,
    `${c.name}: published vk.json = VK exported from the final zkey`,
    async () => {
      const published = (await readJsonFile(vkPath(), MAX_VK_BYTES)).value;
      const problems: string[] = [];
      if (canonicalJson(published) !== canonicalJson(await exportVerificationKey(zkey(), limits))) {
        problems.push("vk.json differs");
      }
      if ((await hashFile(vkPath(), createSha256())) !== final.vk_json_sha256) {
        problems.push("vk.json SHA-256 differs from the final record");
      }
      return problems;
    },
  );

  await attemptGated(ctx, c.name, `${c.name}: δ ≠ γ and δ ≠ genesis δ`, async () =>
    checkDelta(
      await exportVerificationKey(zkey(), limits),
      await exportVerificationKey(staged(files.genesis, c.name, "genesis"), limits),
    ),
  );

  // A null vk_hash is checkFinalRecord's failure outside local mode; here only the recomputation.
  const vkHashId = `${c.name}: vk_hash = blake2_256(packed VK)`;
  if (!final.vk_hash) report.skip(vkHashId, "vk_hash is null in the final record");
  else if (!options.vkPacker) report.skip(vkHashId, "needs --vk-packer", true);
  else {
    const packer = options.vkPacker;
    const recorded = final.vk_hash;
    await report.attempt(vkHashId, async () => {
      const hash = await packedVkHash(packer, vkPath());
      return hash === recorded ? [] : [`recomputed ${hash}`];
    });
  }

  await checkIndependently(ctx, beacon, c);
}
