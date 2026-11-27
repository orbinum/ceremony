/**
 * Builds and checks one circuit's final key in `ctx.out`: beacon → verify from r1cs → re-walk of
 * the recorded chain → VK export → δ ≠ γ, δ ≠ genesis δ → vk_hash. Any failure throws before the
 * final record exists; returns that record.
 */
import { join } from "node:path";
import {
  buildFinalRecord,
  CEREMONY_LAYOUT,
  checkDelta,
  checkFinalEntries,
  circuitOf,
  createSha256,
  finalExpectationOf,
  type FinalRecord,
  headChain,
  readMpcParams,
} from "@orbinum-ceremony/core";
import { layout } from "../../artifacts";
import { hashFile, readBytes, writeJson } from "../../io";
import { applyBeacon, exportVerificationKey, packedVkHash, verifyFromR1cs } from "../../tools";
import type { CircuitPlan, FinalizeContext } from "./types";

export async function finalizeCircuit(
  ctx: FinalizeContext,
  plan: CircuitPlan,
): Promise<FinalRecord> {
  const { circuit, accepted, headZkey } = plan;
  const paths = layout(ctx.dir);
  const pinned = circuitOf(ctx.init, circuit);
  const at = (key: string) => join(ctx.out, key.slice(CEREMONY_LAYOUT.final.length + 1));

  const final = at(CEREMONY_LAYOUT.finalZkey(circuit));
  await applyBeacon(
    headZkey,
    final,
    `drand round ${ctx.beacon.round}`,
    ctx.beacon.randomness,
    ctx.beacon.iterations_exp,
  );

  const params = readMpcParams(await readBytes(final));
  const full = await verifyFromR1cs(
    paths.r1cs(circuit),
    ctx.ptau,
    final,
    undefined,
    params.entries.length,
  );
  if (!full.ok) throw new Error(`${circuit}: final zkey failed verification from r1cs`);
  const rewalk = checkFinalEntries(
    params,
    finalExpectationOf(ctx.store.transcript.records, pinned, ctx.announcement, ctx.beacon),
  );
  if (rewalk.length > 0) throw new Error(`${circuit}: ${rewalk.join("; ")}`);

  const vk = await exportVerificationKey(final);
  const delta = checkDelta(vk, await exportVerificationKey(paths.zkey(circuit, 0)));
  if (delta.length > 0) throw new Error(`${circuit}: ${delta.join("; ")}`);

  const vkPath = at(CEREMONY_LAYOUT.finalVk(circuit));
  await writeJson(vkPath, vk);

  return buildFinalRecord({
    circuit,
    contributions: accepted.length,
    finalZkeySha256: await hashFile(final, createSha256()),
    vkJsonSha256: await hashFile(vkPath, createSha256()),
    vkHash: ctx.vkPacker ? await packedVkHash(ctx.vkPacker, vkPath) : null,
    csHash: pinned.cs_hash,
    finalChain: headChain(ctx.store.transcript.records, ctx.store.genesis),
  });
}
