/**
 * `genesis/init.json`: strict schema, pinned circuit names only, read only canonical. SPEC §2.1,
 * §6.1.
 */
import { describe, expect, it } from "vitest";
import { serializeJson } from "../../../src/primitives/encoding";
import { INIT_SCHEMA, type InitRecord, parseInit, validateInit } from "../../../src/ceremony/init";

const circuit = {
  name: "shield",
  circuit_id: 3,
  ceremony_version: 2,
  r1cs_sha256: "ab".repeat(32),
  constraints: 736,
  public_signals: 3,
  wires: 741,
  domain_power: 10,
  genesis_sha256: "cd".repeat(32),
  cs_hash: "ef".repeat(64),
} as const;

const init: InitRecord = {
  schema: INIT_SCHEMA,
  ceremony_id: "test-1",
  created_at: "2026-10-06T00:00:00.000Z",
  ptau: { file: "powersOfTau28_hez_final_16.ptau", blake2b512: "aa".repeat(64), size: 1 },
  tooling: { snarkjs: "0.7.6", circom: "2.2.3", circomlib: "2.0.5", circom_flags: ["--r1cs"] },
  source: { ref: "v0.16.0", commit: "e".repeat(40) },
  circuits: [circuit],
};

const withCircuits = (circuits: unknown[]) => ({ ...init, circuits });

describe("validateInit", () => {
  it("accepts a well-formed init.json", () => {
    expect(validateInit(structuredClone(init))).toEqual(init);
  });

  it.each([
    [
      "a path-traversal name",
      withCircuits([{ ...circuit, name: "../../tmp/x" }]),
      /\.name: does not match/,
    ],
    [
      "two circuits with one on-chain id",
      withCircuits([circuit, { ...circuit, name: "disclosure" }]),
      /init\.circuits: duplicate circuit_id/,
    ],
    ["a duplicate circuit", withCircuits([circuit, circuit]), /init\.circuits: duplicate circuit/],
    [
      "more circuits than a ceremony may have",
      withCircuits(
        Array.from({ length: 17 }, (_, i) => ({ ...circuit, name: `c${i}`, circuit_id: i + 1 })),
      ),
      /init\.circuits: more than 16 items/,
    ],
    [
      "a circuit without its id",
      withCircuits([{ ...circuit, circuit_id: undefined }]),
      /circuit_id: expected an integer/,
    ],
    [
      "an on-chain id outside 1..2^32-1",
      withCircuits([{ ...circuit, circuit_id: 0 }]),
      /circuit_id: expected an integer in \[1, 4294967295\]/,
    ],
    [
      "a revision instead of a commit",
      { ...init, source: { ref: "v0.16.0", commit: "HEAD" } },
      /init\.source\.commit/,
    ],
    [
      "an option-looking commit",
      { ...init, source: { ref: "x", commit: "--output=/tmp/x" } },
      /init\.source\.commit/,
    ],
    ["an extra top-level field", { ...init, trusted: true }, /unexpected field "trusted"/],
    [
      "a non-ptau file name",
      { ...init, ptau: { ...init.ptau, file: "../../etc/passwd" } },
      /init\.ptau\.file/,
    ],
  ])("rejects %s", (_, value, message) => {
    expect(() => validateInit(value)).toThrow(message);
  });
});

describe("parseInit (the pinned bytes)", () => {
  const text = serializeJson(init);

  it("reads the canonical text", () => {
    expect(parseInit(text)).toEqual(init);
  });

  it.each([
    [
      "a second genesis hash after the first",
      text.replace(
        `"genesis_sha256": "${circuit.genesis_sha256}",`,
        `"genesis_sha256": "${"00".repeat(32)}",\n      "genesis_sha256": "${circuit.genesis_sha256}",`,
      ),
    ],
    ["trailing whitespace", `${text} `],
    ["no final newline", text.slice(0, -1)],
    ["four-space indentation", `${JSON.stringify(init, null, 4)}\n`],
  ])("refuses %s", (_, bytes) => {
    expect(() => parseInit(bytes)).toThrow(/init\.json: not in canonical form/);
  });
});
