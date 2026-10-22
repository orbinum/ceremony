/** The multiplier fixtures (genesis, two contributions, beacon) and snarkjs' own log of them. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "..", "fixtures");

export const loadZkey = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(DIR, `multiplier_${name}.zkey`)));

export const loadR1cs = (): Uint8Array =>
  new Uint8Array(readFileSync(join(DIR, "multiplier.r1cs")));

/** Ground truth from `snarkjs zkey verify` (fixtures/verify.log): csHash and h_k by index. */
export function snarkjsLog(): { csHash: string; hashes: Map<number, string> } {
  const lines = readFileSync(join(DIR, "verify.log"), "utf8").split("\n");
  const hexAfter = (i: number) =>
    lines
      .slice(i + 1, i + 5)
      .join("")
      .replaceAll(/\s/g, "");

  let csHash = "";
  const hashes = new Map<number, string>();
  lines.forEach((line, i) => {
    if (line.includes("Circuit Hash:")) csHash = hexAfter(i);
    const m = /contribution #(\d+)/.exec(line);
    if (m) hashes.set(Number(m[1]), hexAfter(i));
  });
  return { csHash, hashes };
}
