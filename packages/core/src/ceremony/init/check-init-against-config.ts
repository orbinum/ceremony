/** `init.json` against the pinned config: the ptau and the tooling, and every circuit fits the ptau. */
import { PTAU, TOOLING } from "../../config";
import type { InitRecord } from "./types";

export function checkInitAgainstConfig(init: InitRecord): string[] {
  const problems: string[] = [];
  const p = init.ptau;
  if (p.file !== PTAU.file || p.blake2b512 !== PTAU.blake2b512 || p.size !== PTAU.sizeBytes) {
    problems.push("ptau is not the pinned file");
  }
  const t = init.tooling;
  if (t.snarkjs !== TOOLING.snarkjs)
    problems.push(`snarkjs ${t.snarkjs}, pinned ${TOOLING.snarkjs}`);
  if (t.circom !== TOOLING.circom) problems.push(`circom ${t.circom}, pinned ${TOOLING.circom}`);
  if (t.circom_flags.join(" ") !== TOOLING.circomFlags.join(" ")) {
    problems.push(
      `circom flags ${t.circom_flags.join(" ")}, pinned ${TOOLING.circomFlags.join(" ")}`,
    );
  }
  for (const c of init.circuits) {
    if (c.domain_power > PTAU.power) {
      problems.push(`${c.name}: needs a 2^${c.domain_power} domain, ptau provides 2^${PTAU.power}`);
    }
  }
  return problems;
}
