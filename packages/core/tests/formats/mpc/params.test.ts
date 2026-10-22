/** The MPC section: csHash and h_k recomputed as snarkjs does. SPEC §2.5 #3. */
import { describe, expect, it } from "vitest";
import { FormatError } from "../../../src/primitives/errors";
import { readMpcParams } from "../../../src/formats/mpc";
import { loadZkey, snarkjsLog } from "../../support";

const truth = snarkjsLog();

describe("readMpcParams", () => {
  it("matches snarkjs csHash and every h_k, including the beacon", () => {
    const params = readMpcParams(loadZkey("final"));
    expect(params.csHash).toBe(truth.csHash);
    expect(params.entries.map((e) => e.hash)).toEqual([1, 2, 3].map((i) => truth.hashes.get(i)));
  });

  it("decodes entry kinds and parameters", () => {
    const [alice, bob, beacon] = readMpcParams(loadZkey("final")).entries;
    expect(alice).toMatchObject({ kind: "contribution", name: "alice" });
    expect(bob).toMatchObject({ kind: "contribution", name: "bob" });
    expect(beacon).toMatchObject({
      kind: "beacon",
      name: "beacon",
      numIterationsExp: 10,
      beaconHash: "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    });
  });

  it("reads the genesis as zero entries with the same csHash", () => {
    expect(readMpcParams(loadZkey("0"))).toEqual({ csHash: truth.csHash, entries: [] });
  });

  it("keeps earlier hashes stable as the chain grows", () => {
    const one = readMpcParams(loadZkey("1")).entries;
    const two = readMpcParams(loadZkey("2")).entries;
    expect(two[0]).toEqual(one[0]);
  });

  it("enforces maxEntries before parsing", () => {
    expect(() => readMpcParams(loadZkey("final"), { maxEntries: 2 })).toThrow(FormatError);
  });

  it("rejects a truncated file", () => {
    const zkey = loadZkey("final");
    expect(() => readMpcParams(zkey.subarray(0, zkey.length - 10))).toThrow(FormatError);
  });

  it("rejects a wrong magic", () => {
    const zkey = loadZkey("final").slice();
    zkey[0] = 0x58;
    expect(() => readMpcParams(zkey)).toThrow(/magic/);
  });
});
