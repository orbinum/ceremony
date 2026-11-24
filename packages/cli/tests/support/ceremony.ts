/** Real ceremonies on the shield circuit (needs the 75 MB ptau): built, contributed, finalized. */
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAnnouncement,
  CIRCUITS_REPO_URL,
  createSha256,
  domainPower,
  DRAND,
  INIT_SCHEMA,
  type InitRecord,
  type Network,
  PTAU,
  readMpcParams,
  readR1csHeader,
  roundTime,
  serializeJson,
  sha256Hex,
  TOOLING,
  utf8,
  validateInit,
} from "@orbinum-ceremony/core";
import { layout, loadCeremony } from "../../src/artifacts";
import { hashFile, readBytes, writeAtomic } from "../../src/io";
import { openTranscript } from "../../src/store";
import { newGenesisZkey } from "../../src/tools";
import { CLOCK, ROUND_1000, scheduleFor } from "./clock";

/** The real ptau is 75 MB and not in the repo: end-to-end tests run only when it is provided. */
export const PTAU_PATH = process.env.ORBINUM_PTAU;

/** Optional: a clone of the circuits repo, for the release/source checks. */
export const CIRCUITS_REPO = process.env.ORBINUM_CIRCUITS_REPO;

/**
 * circuits v0.17.1, the release of the real-key vectors; the shield r1cs fixture (from v0.16.0) is
 * byte-identical in it, still at active version 1.
 */
export const RELEASE = { tag: "v0.17.1", commit: "05e7d6fa7cde898b34b30d522a1fb38cfcafb5e7" };

export interface TestCeremony {
  dir: string;
  init: InitRecord;
  announcementSha256: string;
}

/**
 * A ceremony directory with only the real `shield` circuit (v0.16.0 r1cs fixture), its init.json
 * and its ceremony.json: the same layout `init` + `announce` produce, built without circom.
 */
export async function shieldOnlyCeremony(
  ptau: string,
  network: Network = "local",
  minContributions = 2,
): Promise<TestCeremony> {
  const dir = await mkdtemp(join(tmpdir(), "orbinum-e2e-"));
  const paths = layout(dir);
  await mkdir(join(dir, "r1cs"), { recursive: true });
  await mkdir(join(dir, "genesis"), { recursive: true });
  await copyFile(join(import.meta.dirname, "..", "fixtures", "shield.r1cs"), paths.r1cs("shield"));

  const genesis = paths.zkey("shield", 0);
  await newGenesisZkey(paths.r1cs("shield"), ptau, genesis);
  const header = readR1csHeader(await readBytes(paths.r1cs("shield")));
  const schedule = scheduleFor(network);

  const init: InitRecord = {
    schema: INIT_SCHEMA,
    ceremony_id: `e2e-${network}`,
    created_at: schedule.createdAt.toISOString(),
    ptau: { file: PTAU.file, blake2b512: PTAU.blake2b512, size: PTAU.sizeBytes },
    tooling: {
      snarkjs: TOOLING.snarkjs,
      circom: TOOLING.circom,
      circomlib: "2.0.5",
      circom_flags: [...TOOLING.circomFlags],
    },
    source: { ref: RELEASE.tag, commit: RELEASE.commit },
    circuits: [
      {
        name: "shield",
        circuit_id: 3,
        ceremony_version: 2,
        r1cs_sha256: await hashFile(paths.r1cs("shield"), createSha256()),
        constraints: header.constraints,
        public_signals: header.publicOutputs + header.publicInputs,
        wires: header.wires,
        domain_power: domainPower(header),
        genesis_sha256: await hashFile(genesis, createSha256()),
        cs_hash: readMpcParams(await readBytes(genesis)).csHash,
      },
    ],
  };
  await writeAtomic(paths.init, serializeJson(validateInit(init)));

  const announcement = buildAnnouncement({
    ceremonyId: init.ceremony_id,
    network,
    initSha256: await hashFile(paths.init, createSha256()),
    circuitsSource: { repo: CIRCUITS_REPO_URL, ...RELEASE },
    minContributions,
    ...schedule,
  });
  const bytes = utf8(serializeJson(announcement));
  await writeAtomic(paths.announcement, bytes);
  return { dir, init, announcementSha256: sha256Hex(bytes) };
}

/** Seals a real drand round in the transcript, as finalize would after fetching it. */
export async function sealRound(dir: string, round: typeof ROUND_1000): Promise<void> {
  const [announcement] = await opened(dir);
  const store = await openTranscript(dir, announcement);
  await store.append({
    type: "beacon",
    ceremony_id: announcement.value.ceremony_id,
    source: "drand",
    chain_hash: DRAND.chainHash,
    ...round,
    iterations_exp: announcement.value.beacon.iterations_exp,
    relays: ["fixture"],
    sealed_at: new Date(roundTime(round.round) * 1000 + 30_000).toISOString(),
  });
}

/** Optional: groth16-proofs `pack-verifying-key`, for ceremonies that must record vk_hash. */
export const VK_PACKER = process.env.ORBINUM_VK_PACKER;

/**
 * Optional: the independent verifier binary (`ceremony-verifier/target/release/ceremony-verifier`).
 */
export const RUST_VERIFIER = process.env.ORBINUM_RUST_VERIFIER;

/** A shield-only ceremony taken all the way: 2 contributions, sealed round 1000, finalized. */
export async function finalizedCeremony(
  ptau: string,
  network: Network = "local",
): Promise<TestCeremony> {
  const { runContributeLocal } = await import("../../src/commands/contribute-local");
  const { runFinalize } = await import("../../src/commands/finalize");
  const ceremony = await shieldOnlyCeremony(ptau, network);
  await runContributeLocal(
    { dir: ceremony.dir, ptau, contributors: 2, crossCheckR1cs: false },
    CLOCK.contribute,
  );
  await sealRound(ceremony.dir, ROUND_1000);
  await runFinalize(
    { dir: ceremony.dir, ptau, ...(VK_PACKER ? { vkPacker: VK_PACKER } : {}) },
    CLOCK.finalize,
  );
  return ceremony;
}

/** A ceremony's announcement and init, as `openTranscript` takes them. */
export async function opened(dir: string) {
  const { announcement, init } = await loadCeremony(dir);
  return [announcement, init.value] as const;
}
