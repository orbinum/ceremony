/**
 * Document validators on mutated documents: each either refuses with a FormatError naming the
 * mutated field, or returns a value that re-validates to itself. A deleted discriminant (`type`,
 * `result`) need not be named: it is read before the record's fields are.
 */
import { describe, expect, it } from "vitest";
import { validateAnnouncement } from "../../src/ceremony/announcement";
import { validateAttestationPayload } from "../../src/ceremony/identity";
import { validateInit } from "../../src/ceremony/init";
import { transcriptOf, validateTranscript } from "../../src/ceremony/transcript";
import { validateJobSpec, validateReport } from "../../src/coordination/protocol";
import { FormatError } from "../../src/primitives/errors";
import { canonicalJson } from "../../src/primitives/hashing";
import {
  ALICE,
  ANNOUNCEMENT,
  ANNOUNCEMENT_SHA256,
  chain,
  contribution,
  ensure,
  ID,
  INIT,
  mulberry32,
  pick,
} from "../support";

const HOSTILE: unknown[] = [
  null,
  Number.NaN,
  2 ** 53,
  -1,
  1.5,
  "",
  "\ud800",
  "AB".repeat(32),
  "x".repeat(10_000),
  Array(10_000).fill(0),
  {},
  [],
  "__proto__",
];

function paths(v: unknown, prefix: (string | number)[] = []): (string | number)[][] {
  if (typeof v !== "object" || v === null) return [prefix];
  const keys = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v);
  return [
    prefix,
    ...keys.flatMap((k) => paths((v as Record<string | number, unknown>)[k], [...prefix, k])),
  ];
}

interface Mutation {
  input: unknown;
  names?: RegExp;
}

function mutate(doc: unknown, rand: () => number): Mutation {
  const copy = structuredClone(doc) as Record<string | number, unknown>;
  const all = paths(copy).filter((p) => p.length > 0);
  const path = all[pick(rand, all.length)] as (string | number)[];
  const parent = path
    .slice(0, -1)
    .reduce<Record<string | number, unknown>>(
      (o, k) => o[k] as Record<string | number, unknown>,
      copy,
    );
  const key = path.at(-1) as string | number;
  const kind = pick(rand, 3);
  const object = !Array.isArray(parent);
  if (kind === 0) {
    delete parent[key];
    return object && key !== "type" && key !== "result"
      ? { input: copy, names: new RegExp(`missing field "${key}"|\\.${key}: `) }
      : { input: copy };
  }
  if (kind === 1 && object) {
    const extra = `extra${pick(rand, 9)}`;
    parent[extra] = 1;
    return { input: copy, names: new RegExp(`unexpected field "${extra}"`) };
  }
  parent[key] = HOSTILE[pick(rand, HOSTILE.length)];
  return { input: copy };
}

function check(validate: (v: unknown) => unknown, doc: unknown, rounds: number, seed: number) {
  expect(validate(structuredClone(doc))).toEqual(doc);
  let refused = 0;
  const rand = mulberry32(seed);
  for (let i = 0; i < rounds; i++) {
    const { input, names } = mutate(doc, rand);
    let out: unknown;
    try {
      out = validate(input);
    } catch (error) {
      if (error instanceof FormatError) {
        refused += 1;
        ensure(!names || names.test(error.message), `"${error.message}" does not name ${names}`);
        continue;
      }
      throw new Error(`non-FormatError on ${JSON.stringify(input).slice(0, 200)}`, {
        cause: error,
      });
    }
    expect(validate(JSON.parse(canonicalJson(out)))).toEqual(out);
  }
  return refused;
}

const attestation = {
  ceremony_id: ID,
  github_id: ALICE.github_id,
  account: ALICE.account,
  seq: 1,
  contributions: [
    {
      circuit: "shield",
      index: 1,
      input_sha256: "11".repeat(32),
      output_sha256: "22".repeat(32),
      contribution_hash: "33".repeat(64),
    },
  ],
  client: { name: "web", version: "1.0.0", commit: "abc1234" },
};
const report = {
  job: { seq: 1, circuit: "shield", attempt: 1, index: 1 },
  result: "valid",
  contributionHash: "ab".repeat(64),
  zkeyName: "alice",
  deltaAfter: "cd".repeat(64),
  logSha256: "ef".repeat(32),
  log: "ok\n",
  verifierVersion: "0.1.0",
  snarkjsVersion: "0.7.6",
};
const spec = {
  job: { seq: 1, circuit: "shield", attempt: 1, index: 1 },
  claim: {
    inputSha256: "aa".repeat(32),
    outputSha256: "bb".repeat(32),
    contributionHash: "cc".repeat(64),
    method: "cli",
    client: { name: "c", version: "1", commit: "abc1234" },
  },
  size: 100,
  head: { outputSha256: "aa".repeat(32), csHash: "ee".repeat(64), previous: [] },
  genesisSha256: "aa".repeat(32),
};

describe("fuzz: document validators refuse with FormatError or return a fixed point", () => {
  it.each([
    ["announcement", validateAnnouncement, ANNOUNCEMENT],
    ["init", validateInit, INIT],
    [
      "transcript",
      validateTranscript,
      transcriptOf(ID, ANNOUNCEMENT_SHA256, chain([contribution(1), contribution(2)])),
    ],
    ["attestation payload", (v: unknown) => validateAttestationPayload(v, "eip712"), attestation],
    ["verifier report", validateReport, report],
    ["job spec", validateJobSpec, spec],
  ] as const)("%s", { timeout: 60_000 }, (_, validate, doc) => {
    const refused = check(
      validate as (v: unknown) => unknown,
      doc,
      400,
      doc === ANNOUNCEMENT ? 1 : 2,
    );
    expect(refused).toBeGreaterThan(100);
  });
});
