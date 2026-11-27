/**
 * A circuit's final key re-verified by a second implementation (Rust + arkworks), which also
 * re-derives the genesis and whose h_k must be exactly the transcript's: two implementations, one
 * chain.
 */
import { type BeaconRecord, checkIndependent, type InitCircuit } from "@orbinum-ceremony/core";
import { runIndependentVerifier } from "../../../tools";
import { attemptGated, staged, stagedPtau } from "../context";
import type { VerifyContext } from "../types";

export async function checkIndependently(
  ctx: VerifyContext,
  beacon: BeaconRecord,
  c: InitCircuit,
): Promise<void> {
  const id = `${c.name}: independent verifier (Rust, no snarkjs) agrees`;
  const bin = ctx.options.rustVerifier;
  if (!bin) {
    ctx.report.skip(id, "needs --rust-verifier", true);
    return;
  }
  await attemptGated(ctx, c.name, id, async () => {
    const verdict = await runIndependentVerifier(bin, {
      genesis: staged(ctx.files.genesis, c.name, "genesis"),
      final: staged(ctx.files.finalZkey, c.name, "final zkey"),
      minContributions: ctx.announcement.value.min_contributions,
      beacon: { randomness: beacon.randomness, iterationsExp: beacon.iterations_exp },
      source: { r1cs: staged(ctx.files.r1cs, c.name, "r1cs"), ptau: stagedPtau(ctx) },
    });
    return checkIndependent(verdict, ctx.transcript.records, c);
  });
}
