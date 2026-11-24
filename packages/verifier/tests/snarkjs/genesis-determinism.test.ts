/**
 * Genesis determinism across machines (A1): every genesis key of the real-key vectors, built on
 * macOS, is rebuilt here from its r1cs and the pinned ptau and must be byte-identical to the hash
 * `init.json` pins. CI runs it on Linux, so the property holds on two operating systems.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CEREMONY_LAYOUT, parseInit, sha256Hex } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import { newGenesisZkey } from "../../src";
import { PTAU_PATH } from "../support";

const DIR = process.env.ORBINUM_REHEARSAL_DIR;
const ready = PTAU_PATH !== undefined && DIR !== undefined && existsSync(DIR);

describe.skipIf(!ready)("genesis keys rebuilt on this machine", { timeout: 600_000 }, () => {
  it("are byte-identical to the vectors' pinned genesis", async () => {
    const dir = DIR as string;
    const init = parseInit(await readFile(join(dir, CEREMONY_LAYOUT.init), "utf8"));
    const out = await mkdtemp(join(tmpdir(), "orbinum-genesis-"));
    try {
      for (const c of init.circuits) {
        const genesis = join(out, `${c.name}.genesis.zkey`);
        // oxlint-disable-next-line no-await-in-loop -- one heavy build at a time
        await newGenesisZkey(join(dir, CEREMONY_LAYOUT.r1cs(c.name)), PTAU_PATH as string, genesis);
        // oxlint-disable-next-line no-await-in-loop
        const rebuilt = sha256Hex(new Uint8Array(await readFile(genesis)));
        expect([c.name, rebuilt]).toEqual([c.name, c.genesis_sha256]);
      }
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
