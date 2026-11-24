/**
 * The light entry a snarkjs child loads: its whole relative import graph stays clear of the
 * wallet libraries the barrel brings (ethers, @polkadot), so each child starts without them.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");
const IMPORT = /^\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gm;

/** Every bare package a module reaches through its relative imports. */
function packagesReached(entry: string): Set<string> {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, spec] of readFileSync(file, "utf8").matchAll(IMPORT)) {
      if (!spec) continue;
      if (!spec.startsWith(".")) {
        packages.add(spec);
        continue;
      }
      const base = resolve(dirname(file), spec);
      const candidates = [`${base}.ts`, join(base, "index.ts"), base];
      const found = candidates.find((c) => {
        try {
          readFileSync(c);
          return true;
        } catch {
          return false;
        }
      });
      if (found) visit(found);
    }
  };
  visit(entry);
  return packages;
}

describe("the snarkjs child's entry", () => {
  it("reaches no wallet library", () => {
    const reached = [...packagesReached(join(SRC, "snarkjs-child.ts"))];
    expect(reached.filter((p) => /^(ethers|@polkadot\/)/.test(p))).toEqual([]);
    // The barrel does reach them: the entry is what keeps them out.
    const barrel = [...packagesReached(join(SRC, "index.ts"))];
    expect(barrel.some((p) => p === "ethers")).toBe(true);
  });
});
