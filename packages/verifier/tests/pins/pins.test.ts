/** Files and bytes against their pins (SPEC §1.3, §6.1): size and hash, the ptau's included. */
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type InitRecord, PTAU, sha256Hex, utf8 } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertPinnedBytes,
  assertPinnedFile,
  assertPinnedPtau,
  assertPtauBytes,
} from "../../src/pins";

/** Only the fields the pins read. */
const init = {
  circuits: [
    { name: "shield", r1cs_sha256: sha256Hex(utf8("r1cs")), genesis_sha256: "00".repeat(32) },
  ],
} as unknown as InitRecord;

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbinum-pins-test-"));
  await writeFile(join(dir, "r1cs"), "r1cs");
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("pins", () => {
  it("accepts a file or bytes matching init.json, refuses anything else", async () => {
    await expect(
      assertPinnedFile(init, "shield", "r1cs", join(dir, "r1cs")),
    ).resolves.toBeUndefined();
    expect(() => assertPinnedBytes(init, "shield", "r1cs", utf8("r1cs"))).not.toThrow();
    await expect(assertPinnedFile(init, "shield", "genesis", join(dir, "r1cs"))).rejects.toThrow(
      "shield genesis does not match init.json",
    );
    expect(() => assertPinnedBytes(init, "shield", "r1cs", utf8("other"))).toThrow(
      "shield r1cs does not match init.json",
    );
  });

  it(
    "refuses a ptau of the pinned size whose BLAKE2b-512 is not the pin",
    { timeout: 60_000 },
    async () => {
      const sparse = join(dir, "zeros.ptau");
      await writeFile(sparse, "");
      await truncate(sparse, PTAU.sizeBytes);
      await expect(assertPinnedPtau(sparse)).rejects.toThrow(
        "ptau BLAKE2b-512 does not match the pin",
      );
      expect(() => assertPtauBytes(new Uint8Array(PTAU.sizeBytes))).toThrow(
        "ptau does not match the pin",
      );
    },
  );

  it("refuses a ptau of the wrong size before hashing it", async () => {
    await writeFile(join(dir, "ptau"), "short");
    await expect(assertPinnedPtau(join(dir, "ptau"))).rejects.toThrow(/^ptau size 5, expected/);
    expect(() => assertPtauBytes(utf8("short"))).toThrow("ptau does not match the pin");
  });
});
