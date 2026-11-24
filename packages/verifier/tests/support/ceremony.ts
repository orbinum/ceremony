/** Ceremony fixtures: the real `shield` genesis when the ptau is given, and hermetic stand-ins. */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSha256,
  domainPower,
  INIT_SCHEMA,
  type InitRecord,
  PTAU,
  readMpcParams,
  readR1csHeader,
  sha256Hex,
  TOOLING,
} from "@orbinum-ceremony/core";
import { createStage, hashFile, newGenesisZkey, readBytes, writeJson } from "../../src";
import type { Inputs } from "../../src/service";

/** The real ptau is 75 MB and not in the repo: these tests run only when it is provided. */
export const PTAU_PATH = process.env.ORBINUM_PTAU;

/** The ceremony every fixture belongs to (init.json `ceremony_id`, bound into every MAC). */
export const CEREMONY_ID = "verifier-test";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const R1CS = join(FIXTURES, "shield.r1cs");

/** A valid init.json for the `shield` fixture with the given genesis pins. */
export async function shieldInit(genesisSha256: string, csHash: string): Promise<InitRecord> {
  const header = readR1csHeader(await readBytes(R1CS));
  return {
    schema: INIT_SCHEMA,
    ceremony_id: CEREMONY_ID,
    created_at: new Date().toISOString(),
    ptau: { file: PTAU.file, blake2b512: PTAU.blake2b512, size: PTAU.sizeBytes },
    tooling: {
      snarkjs: TOOLING.snarkjs,
      circom: TOOLING.circom,
      circomlib: "2.0.5",
      circom_flags: ["--r1cs", "--O1"],
    },
    source: { ref: "v0.16.0", commit: "efe10bf3ef1d928c9c209fee4077750334410cfe" },
    circuits: [
      {
        name: "shield",
        circuit_id: 3,
        ceremony_version: 2,
        r1cs_sha256: await hashFile(R1CS, createSha256()),
        constraints: header.constraints,
        public_signals: header.publicOutputs + header.publicInputs,
        wires: header.wires,
        domain_power: domainPower(header),
        genesis_sha256: genesisSha256,
        cs_hash: csHash,
      },
    ],
  };
}

/** A ceremony directory with the real `shield` genesis (v0.16.0 r1cs fixture) and its init.json. */
export async function shieldCeremony(ptau: string): Promise<{ dir: string; init: InitRecord }> {
  const dir = await mkdtemp(join(tmpdir(), "orbinum-verifier-test-"));
  await mkdir(join(dir, "genesis"));
  const genesis = join(dir, "genesis", "shield.genesis.zkey");
  await newGenesisZkey(R1CS, ptau, genesis);
  const init = await shieldInit(
    await hashFile(genesis, createSha256()),
    readMpcParams(await readBytes(genesis)).csHash,
  );
  await writeJson(join(dir, "genesis", "init.json"), init);
  return { dir, init };
}

/**
 * A hermetic ceremony directory: a stand-in genesis (any bytes) pinned by a valid init.json, and a
 * stand-in ptau that can never match its pin.
 */
export async function fakeCeremony(): Promise<{ dir: string; ptau: string; init: InitRecord }> {
  const dir = await mkdtemp(join(tmpdir(), "orbinum-verifier-fake-"));
  await mkdir(join(dir, "genesis"));
  const genesis = new TextEncoder().encode("a stand-in genesis");
  await writeFile(join(dir, "genesis", "shield.genesis.zkey"), genesis);
  const init = await shieldInit(sha256Hex(genesis), "00".repeat(64));
  await writeJson(join(dir, "genesis", "init.json"), init);
  const ptau = join(dir, "fake.ptau");
  await writeFile(ptau, "not the ptau");
  return { dir, ptau, init };
}

/**
 * A hermetic ceremony on the multiplier fixture: its genesis (a real zkey) stands in for
 * `shield`'s, and `ptauText` for the ptau (pinned only where a test swaps core's pin for it).
 */
export async function multiplierCeremony(
  ptauText: string,
): Promise<{ dir: string; ptau: string; init: InitRecord }> {
  const dir = await mkdtemp(join(tmpdir(), "orbinum-verifier-multiplier-"));
  await mkdir(join(dir, "genesis"));
  const genesis = await readBytes(join(FIXTURES, "multiplier_0.zkey"));
  await writeFile(join(dir, "genesis", "shield.genesis.zkey"), genesis);
  const init = await shieldInit(sha256Hex(genesis), readMpcParams(genesis).csHash);
  await writeJson(join(dir, "genesis", "init.json"), init);
  const ptau = join(dir, "fake.ptau");
  await writeFile(ptau, ptauText);
  return { dir, ptau, init };
}

/**
 * `Inputs` built directly from a fake ceremony, staged like `loadInputs` does but without pinning
 * the ptau (which a stand-in cannot pass): every job's pin check then fails, as on a tampered host.
 */
export async function fakeInputs(): Promise<{ dir: string; inputs: Inputs }> {
  const { dir, ptau, init } = await fakeCeremony();
  return { dir, inputs: await stagedInputs(dir, ptau, init) };
}

/** `Inputs` staged from `dir` and `ptau` as `loadInputs` stages them, assumed pinned. */
export async function stagedInputs(dir: string, ptau: string, init: InitRecord): Promise<Inputs> {
  const stage = await createStage("orbinum-verifier-test-inputs-");
  const genesis = await stage.copy(join(dir, "genesis", "shield.genesis.zkey"), "shield.zkey");
  return {
    init,
    ptau: await stage.copy(ptau, "ptau"),
    genesis: { shield: { path: genesis, sha256: init.circuits[0]?.genesis_sha256 as string } },
    stage,
    pinned: true,
    sources: { ceremonyDir: dir, ptau },
  };
}
