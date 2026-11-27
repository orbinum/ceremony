/**
 * Builds every circuit for `init` in order; returns their init.json entries. A set past the bounds
 * the session and verifier were measured for stops before more genesis builds, unless
 * `beyondMeasuredBounds` says they were re-measured.
 */
import { type CircuitName, checkMeasuredBounds, type InitCircuit } from "@orbinum-ceremony/core";
import { buildCircuit } from "./build-circuit";
import type { BuildContext } from "./types";

export async function buildCircuits(
  circuits: readonly { name: CircuitName; circuitId: number }[],
  ctx: BuildContext,
  beyondMeasuredBounds: boolean,
): Promise<InitCircuit[]> {
  const built: InitCircuit[] = [];
  for (const { name, circuitId } of circuits) {
    console.log(`${name} (id ${circuitId}): compile, check, genesis`);
    const c = await buildCircuit(name, circuitId, ctx);
    console.log(
      `  v${c.ceremony_version}, ${c.constraints} constraints, r1cs ${c.r1cs_sha256.slice(0, 16)}… csHash ${c.cs_hash.slice(0, 16)}…`,
    );
    built.push(c);
    const beyond = checkMeasuredBounds(built);
    if (beyond.length > 0 && !beyondMeasuredBounds) {
      throw new Error(
        `${beyond.join("; ")}: re-measure the active cap, the snarkjs bounds and the container, raise them, then pass --beyond-measured-bounds`,
      );
    }
  }
  return built;
}
