/**
 * The SPEC §2.5 pipeline on an upload, hermetic: real uploads built from the multiplier fixture
 * and the pairing checks replaced so every outcome can be forced. An honest upload, and every
 * pre-check refusal, which is definitive and never reaches snarkjs.
 */
import { execFileSync } from "node:child_process";
import { rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import {
  type CurrentHead,
  genesisLayoutOf,
  readMpcParams,
  readSections,
  type UploadClaim,
  uniqueSection,
} from "@orbinum-ceremony/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type UploadFiles, verifyUpload } from "../../src/pipeline";
import { verifyFromInit, verifyFromR1cs } from "../../src/snarkjs";
import {
  buildUploads,
  claimFor,
  delta2LimbPlusQ,
  groth16Offset,
  MULTIPLIER_GENESIS,
  type Upload,
  type Uploads,
  within,
  written,
} from "../support";

vi.mock("../../src/snarkjs", async (actual) => ({
  ...(await actual<typeof import("../../src/snarkjs")>()),
  verifyFromInit: vi.fn<typeof verifyFromInit>(),
  verifyFromR1cs: vi.fn<typeof verifyFromR1cs>(),
}));
const zkvi = vi.mocked(verifyFromInit);
const zkv = vi.mocked(verifyFromR1cs);
const OK = { ok: true, log: "[info] ZKey Ok!" };

let u: Uploads;
let ptau = "";

const verify = (
  up: Upload,
  head: CurrentHead = u.atGenesis,
  { files = {}, claim = {} }: { files?: Partial<UploadFiles>; claim?: Partial<UploadClaim> } = {},
) =>
  verifyUpload(
    { zkey: up.path, genesis: MULTIPLIER_GENESIS, ptau, ...files },
    { ...claimFor(up, head), ...claim },
    head,
  );

/** `bytes` written as a new upload, claiming `hash` (c1's by default). */
const upload = (name: string, bytes: Uint8Array, hash = u.c1.hash) =>
  written(u.dir, name, bytes, hash);

/** n8q (the Groth16 header's first field) set huge: snarkjs would allocate from it. */
const headerBomb = () => {
  const bytes = u.c1.bytes.slice();
  new DataView(bytes.buffer).setUint32(groth16Offset(bytes), 0xfffffffc, true);
  return upload("n8q-bomb.zkey", bytes);
};

/**
 * `up` as if its last contribution had secret 1: the Groth16 header's δ and the entry's δ_after
 * become `from`'s (the genesis', or the previous upload's). Both are written as `writeG1`, so the
 * entry is found by the header's current δ1 bytes. h_k is the file's own.
 */
const noop = async (name: string, up: Upload, from: Upload) => {
  const bytes = up.bytes.slice();
  const g16 = groth16Offset;
  const { deltaFrom, deltaTo } = genesisLayoutOf(from.bytes);
  const delta = from.bytes.subarray(g16(from.bytes) + deltaFrom, g16(from.bytes) + deltaTo);
  const current = bytes.slice(g16(bytes) + deltaFrom, g16(bytes) + deltaFrom + 64);
  const mpc = uniqueSection(readSections(bytes, "zkey"), 10);
  const at = Buffer.from(bytes.subarray(mpc.offset, mpc.offset + mpc.size)).lastIndexOf(current);
  if (at < 0) throw new Error("δ_after not found in the MPC section");
  bytes.set(delta.subarray(0, 64), mpc.offset + at);
  bytes.set(delta, g16(bytes) + deltaFrom);
  return upload(name, bytes, readMpcParams(bytes).entries.at(-1)?.hash);
};
const withPrevious = (change: Partial<CurrentHead["previous"][number]>): CurrentHead => ({
  ...u.afterC1,
  previous: [{ ...(u.afterC1.previous[0] as CurrentHead["previous"][number]), ...change }],
});

beforeAll(async () => {
  u = await buildUploads();
  ptau = (
    await upload(
      "fake.ptau",
      new TextEncoder().encode("a pinned ptau, as far as the pipeline can tell"),
    )
  ).path;
}, 60_000);
afterAll(() => rm(u.dir, { recursive: true, force: true }));
beforeEach(() => {
  zkvi.mockReset().mockResolvedValue(OK);
  zkv.mockReset().mockResolvedValue(OK);
});

describe("an honest upload", () => {
  it("is valid, verified by zkvi on the private copy, never on the original path", async () => {
    const res = await verify(u.c1);
    expect(res.verdict).toEqual({ result: "valid", index: 1, contributionHash: u.c1.hash });
    expect(res.accepted).toEqual({ name: "test-1", deltaAfter: u.afterC1.previous[0]?.deltaAfter });
    expect(res.log).toBe(OK.log);
    expect(zkvi).toHaveBeenCalledTimes(1);
    const [genesis, usedPtau, copy] = zkvi.mock.calls[0] ?? [];
    expect([genesis, usedPtau]).toEqual([MULTIPLIER_GENESIS, ptau]);
    expect(copy).not.toBe(u.c1.path);
    expect(copy).toMatch(/upload\.zkey$/);
    expect(zkv).not.toHaveBeenCalled();
  });

  it("passes the caller's limits to snarkjs", async () => {
    await verifyUpload(
      { zkey: u.c1.path, genesis: MULTIPLIER_GENESIS, ptau },
      claimFor(u.c1, u.atGenesis),
      u.atGenesis,
      { timeoutMs: 1234 },
    );
    expect(zkvi.mock.calls[0]?.[3]).toEqual({ timeoutMs: 1234 });
  });

  it("takes a claim in uppercase hex", async () => {
    const claim = claimFor(u.c2, u.afterC1);
    const res = await verify(u.c2, u.afterC1, {
      claim: {
        inputSha256: claim.inputSha256.toUpperCase(),
        outputSha256: claim.outputSha256.toUpperCase(),
        contributionHash: claim.contributionHash.toUpperCase(),
      },
    });
    expect(res.verdict).toMatchObject({ result: "valid", index: 2 });
  });
});

describe("pre-check refusals: definitive, and snarkjs never runs", () => {
  const cases: [string, string, () => Promise<Awaited<ReturnType<typeof verify>>>][] = [
    [
      "malformed-claim",
      "a claim that is not hex",
      () => verify(u.c1, u.atGenesis, { claim: { contributionHash: "xyz" } }),
    ],
    [
      "output-hash-mismatch",
      "bytes that are not the claimed ones",
      () => verify(u.c1, u.atGenesis, { claim: { outputSha256: "00".repeat(32) } }),
    ],
    [
      "stale-head",
      "an upload built on another head",
      () => verify(u.c1, u.atGenesis, { claim: { inputSha256: "11".repeat(32) } }),
    ],
    [
      "malformed",
      "bytes that are not a zkey",
      async () => verify(await upload("garbage.zkey", new TextEncoder().encode("garbage"))),
    ],
    ["malformed", "a header-field bomb (n8q = 0xFFFFFFFC)", async () => verify(await headerBomb())],
    [
      "malformed",
      "a section-table bomb (100 000 sections declared)",
      async () => {
        const bomb = new Uint8Array(12 + 100_000 * 12);
        bomb.set(new TextEncoder().encode("zkey"));
        new DataView(bomb.buffer).setUint32(4, 1, true);
        new DataView(bomb.buffer).setUint32(8, 100_000, true);
        return verify(await upload("sections-bomb.zkey", bomb));
      },
    ],
    [
      "malformed",
      "a truncated upload",
      async () => verify(await upload("cut.zkey", u.c1.bytes.subarray(0, u.c1.bytes.length - 100))),
    ],
    [
      "malformed",
      "padding appended to an honest upload (a second hash for the same key)",
      async () => verify(await upload("padded.zkey", new Uint8Array([...u.c1.bytes, 0, 0, 0]))),
    ],
    [
      "cs-hash-mismatch",
      "another circuit's chain",
      () => verify(u.c1, { ...u.atGenesis, csHash: "00".repeat(64) }),
    ],
    ["malformed", "more entries than the head allows", () => verify(u.c2, u.atGenesis)],
    ["wrong-count", "no new entry", () => verify(u.c1, u.afterC1)],
    [
      "prefix-mismatch",
      "a rewritten earlier entry",
      () => verify(u.c2, withPrevious({ hash: "00".repeat(64) })),
    ],
    [
      "name-rewritten",
      "a renamed earlier contributor",
      () => verify(u.c2, withPrevious({ name: "someone-else" })),
    ],
    [
      "name-rewritten",
      "an upload that renames the previous contributor in its bytes (same length, same h_k)",
      async () => {
        const text = Buffer.from(u.c2.bytes);
        text.write("evil-1", text.indexOf("test-1"));
        return verify(await upload("renamed.zkey", new Uint8Array(text), u.c2.hash), u.afterC1);
      },
    ],
    ["not-a-contribution", "a beacon instead of a contribution", () => verify(u.beacon, u.afterC1)],
    ["bad-name", "a name with a control byte", () => verify(u.badName, u.afterC1)],
    [
      "noop-contribution",
      "a contribution that leaves the genesis δ unchanged",
      async () => verify(await noop("noop-genesis.zkey", u.c1, u.genesis)),
    ],
    [
      "noop-contribution",
      "a contribution that leaves the previous δ unchanged",
      async () => verify(await noop("noop-previous.zkey", u.c2, u.c1), u.afterC1),
    ],
    [
      "client-hash-mismatch",
      "a claimed h_k that is not the file's",
      () => verify(u.c1, u.atGenesis, { claim: { contributionHash: "00".repeat(64) } }),
    ],
  ];

  it.each(cases)("%s: %s", async (reason, _, run) => {
    const res = await run();
    expect(res.verdict).toMatchObject({ result: "rejected", reason });
    expect(res.log).toBe("");
    expect(zkvi).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3] as const)(
    "malformed: δ2 limb %i spelled as limb + q (a head that poisons the next contribution)",
    async (limb) => {
      const res = await verify(
        await upload(`delta2-${limb}.zkey`, delta2LimbPlusQ(u.c2.bytes, limb), u.c2.hash),
        u.afterC1,
      );
      expect(res.verdict).toMatchObject({ result: "rejected", reason: "malformed" });
      expect(zkvi).not.toHaveBeenCalled();
    },
  );

  it("refuses a symlink, a FIFO or a missing file in place of the upload", async () => {
    const link = join(u.dir, "link.zkey");
    await symlink(u.c1.path, link);
    const fifo = join(u.dir, "fifo.zkey");
    execFileSync("mkfifo", [fifo]);
    for (const path of [link, fifo, join(u.dir, "missing.zkey")]) {
      // oxlint-disable-next-line no-await-in-loop -- one upload at a time
      const res = await within(5_000, path, verify({ ...u.c1, path }));
      expect(res.verdict).toMatchObject({ result: "rejected", reason: "malformed" });
    }
    expect(zkvi).not.toHaveBeenCalled();
  });
});
