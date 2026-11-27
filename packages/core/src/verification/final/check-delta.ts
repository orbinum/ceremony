/**
 * δ of a final verification key against γ and the genesis δ. δ must differ from γ (otherwise phase
 * 2 was skipped and proofs can be forged; −γ is as forgeable) and from the genesis δ (otherwise no
 * contribution was applied). Points are read as canonical affine G2 points in snarkjs vk.json
 * decimal form (at most 77 digits, each below q) and compared as field elements, so the same point
 * cannot hide behind another spelling; anything else fails closed.
 */
import { BN254_FQ } from "../../formats/bn254";

const DECIMAL = /^(0|[1-9][0-9]{0,76})$/;

function parseG2(value: unknown, field: string): bigint[] | string {
  const bad = `${field}: not an affine G2 point`;
  if (!Array.isArray(value) || value.length !== 3) return bad;
  const coords: bigint[] = [];
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2) return bad;
    for (const c of pair) {
      if (typeof c !== "string" || !DECIMAL.test(c)) return bad;
      const n = BigInt(c);
      if (n >= BN254_FQ) return bad;
      coords.push(n);
    }
  }
  if (coords[4] !== 1n || coords[5] !== 0n) return bad;
  return coords.slice(0, 4);
}

const samePoint = (a: bigint[], b: bigint[]) => a.every((x, i) => x === b[i]);
const negated = (p: bigint[]) => p.map((c, i) => (i < 2 || c === 0n ? c : BN254_FQ - c));

export function checkDelta(
  vk: { vk_delta_2?: unknown; vk_gamma_2?: unknown },
  genesis: { vk_delta_2?: unknown },
): string[] {
  const delta = parseG2(vk.vk_delta_2, "vk_delta_2");
  const gamma = parseG2(vk.vk_gamma_2, "vk_gamma_2");
  const genesisDelta = parseG2(genesis.vk_delta_2, "genesis vk_delta_2");
  const malformed = [delta, gamma, genesisDelta].filter((p): p is string => typeof p === "string");
  if (malformed.length > 0) return malformed;

  const problems: string[] = [];
  if (samePoint(delta as bigint[], gamma as bigint[])) problems.push("δ = γ: phase 2 was skipped");
  if (samePoint(delta as bigint[], negated(gamma as bigint[]))) {
    problems.push("δ = −γ: as forgeable as δ = γ");
  }
  if (samePoint(delta as bigint[], genesisDelta as bigint[]))
    problems.push("δ equals the genesis δ");
  return problems;
}
