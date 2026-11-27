/**
 * Hostile uploads against the real pipeline: real snarkjs and the pinned ptau, on top of an
 * accepted contribution #1, the head every attack builds on. The pre-check refusals are hermetic in
 * `verify-upload.test.ts`. A non-canonical δ2 limb, accepted, would make every honest contribution
 * on that head fail zkvi.
 */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CurrentHead, type InitRecord, sha256Hex } from "@orbinum-ceremony/core";
import { beforeAll, describe, expect, it } from "vitest";
import { contribute, verifyUpload } from "../../src";
import { delta2LimbPlusQ, PTAU_PATH, shieldCeremony } from "../support";

describe.skipIf(!PTAU_PATH)("attacks on the upload verifier", { timeout: 180_000 }, () => {
  const ptau = PTAU_PATH as string;
  let genesisZkey: string;
  let head: CurrentHead;
  let headZkey: string;
  let work: string;

  const verify = (zkey: string, bytes: Uint8Array, contributionHash: string, r1cs?: string) =>
    verifyUpload(
      { zkey, genesis: genesisZkey, ptau, ...(r1cs ? { r1cs } : {}) },
      { inputSha256: head.outputSha256, outputSha256: sha256Hex(bytes), contributionHash },
      head,
    );

  beforeAll(async () => {
    const { dir, init } = await shieldCeremony(ptau);
    const genesis = init.circuits[0] as InitRecord["circuits"][number];
    genesisZkey = join(dir, "genesis", "shield.genesis.zkey");
    work = await mkdtemp(join(tmpdir(), "orbinum-upload-attacks-"));
    headZkey = join(work, "1.zkey");
    const h1 = await contribute(genesisZkey, headZkey, "local-1", "entropy-1");
    const first = await verifyUpload(
      { zkey: headZkey, genesis: genesisZkey, ptau },
      {
        inputSha256: genesis.genesis_sha256,
        outputSha256: sha256Hex(new Uint8Array(await readFile(headZkey))),
        contributionHash: h1,
      },
      { outputSha256: genesis.genesis_sha256, csHash: genesis.cs_hash, previous: [] },
    );
    if (!first.accepted) throw new Error("contribution #1 was not accepted");
    head = {
      outputSha256: sha256Hex(new Uint8Array(await readFile(headZkey))),
      csHash: genesis.cs_hash,
      previous: [{ hash: h1, name: first.accepted.name, deltaAfter: first.accepted.deltaAfter }],
    };
  }, 180_000);

  async function honest(name: string) {
    const path = join(work, name);
    const hash = await contribute(headZkey, path, "honest-2", "entropy");
    return { path, bytes: new Uint8Array(await readFile(path)), hash };
  }

  it("accepts an honest contribution", async () => {
    const { path, bytes, hash } = await honest("ok.zkey");
    const res = await verify(path, bytes, hash);
    expect(res.verdict).toMatchObject({ result: "valid", index: 2 });
    expect(res.accepted?.name).toBe("honest-2");
  });

  it("accepts it cross-checked from r1cs too", async () => {
    const { path, bytes, hash } = await honest("cross.zkey");
    const r1cs = join(import.meta.dirname, "..", "fixtures", "shield.r1cs");
    const res = await verify(path, bytes, hash, r1cs);
    expect(res.verdict).toMatchObject({ result: "valid", index: 2 });
    expect(res.ms.verifyFromR1cs).toBeGreaterThan(0);
  });

  it.each([0, 1, 2, 3] as const)(
    "rejects δ2 limb %i spelled as limb + q as malformed: snarkjs' pairing would accept it",
    async (limb) => {
      const { bytes, hash } = await honest(`delta2-${limb}-src.zkey`);
      const mutated = delta2LimbPlusQ(bytes, limb);
      const path = join(work, `delta2-${limb}.zkey`);
      await writeFile(path, mutated);
      expect((await verify(path, mutated, hash)).verdict).toMatchObject({
        result: "rejected",
        reason: "malformed",
      });
    },
  );
});
