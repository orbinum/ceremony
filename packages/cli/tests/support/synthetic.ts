/**
 * A synthetic ceremony directory: the real documents (init.json, ceremony.json, a hash-chained
 * transcript, a sealed drand round, final records) over fake key files whose hashes they pin. No
 * ptau and no snarkjs, so every check that needs no pairing (pins, anchor, chain, links, window,
 * modes, rollback, finalize preflight, publication) runs without the real inputs (TEST-51).
 */
import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRecord,
  buildAnnouncement,
  buildBeaconRecord,
  buildContributionRecord,
  buildFinalRecord,
  type CeremonyAnnouncement,
  type Chained,
  chainGenesis,
  CIRCUITS_REPO_URL,
  type CircuitName,
  domainPower,
  DRAND,
  headChain,
  INIT_SCHEMA,
  type InitRecord,
  LOCAL_BUILD,
  LOCAL_VERIFIER,
  type Network,
  PTAU,
  serializeJson,
  sha256Hex,
  type Transcript,
  TOOLING,
  transcriptOf,
  utf8,
  validateInit,
  vkHashOf,
} from "@orbinum-ceremony/core";
import { layout } from "../../src/artifacts";
import { ensureDir, writeAtomic, writeJson } from "../../src/io";
import { ROUND_1000, scheduleFor, T_ROUND } from "./clock";

/** The shapes of circuits v0.17.1, as `init` would pin them. */
const SHAPES: Record<
  string,
  { id: number; version: number; constraints: number; publicSignals: number }
> = {
  shield: { id: 3, version: 2, constraints: 736, publicSignals: 3 },
  unshield: { id: 2, version: 4, constraints: 17_290, publicSignals: 8 },
  transfer: { id: 1, version: 4, constraints: 34_200, publicSignals: 9 },
};
const shapeOf = (c: string) => {
  const s = SHAPES[c];
  if (!s) throw new Error(`no test shape for ${c}`);
  return s;
};

/** The release a synthetic ceremony announces (a real one is not needed: nothing compiles). */
export const SYNTHETIC_RELEASE = { tag: "v1.0.0", commit: "c0ffee".padEnd(40, "0") };

/** What the synthetic ceremony is made of. */
export interface SyntheticOptions {
  network?: Network;
  circuits?: readonly CircuitName[];
  /** Simulated contributors, each contributing to every circuit (also the announced minimum). */
  contributors?: number;
  /** Seal round 1000 and write the final keys and records. */
  finalized?: boolean;
  release?: { tag: string; commit: string };
  /** init.json's circom flags (default: the pinned ones). */
  circomFlags?: string[];
}

/** A synthetic ceremony on disk. */
export interface Synthetic {
  dir: string;
  init: InitRecord;
  announcement: CeremonyAnnouncement;
  announcementSha256: string;
  transcript: Transcript;
}

const hex = (bytes: number) => randomBytes(bytes).toString("hex");

/** Unique bytes standing in for a key file. */
const fake = (what: string) => utf8(`synthetic ${what} ${hex(16)}`);

/** Writes `bytes` under the ceremony key `key`; returns their SHA-256. */
async function put(dir: string, key: string, bytes: Uint8Array): Promise<string> {
  const path = join(dir, key);
  await ensureDir(join(path, ".."));
  await writeAtomic(path, bytes);
  return sha256Hex(bytes);
}

/** Builds a synthetic ceremony in a fresh directory. */
export async function syntheticCeremony(options: SyntheticOptions = {}): Promise<Synthetic> {
  const network = options.network ?? "local";
  const circuits = options.circuits ?? ["shield"];
  const contributors = options.contributors ?? 2;
  const release = options.release ?? SYNTHETIC_RELEASE;
  const dir = await mkdtemp(join(tmpdir(), "orbinum-synthetic-"));
  const paths = layout(dir);
  const schedule = scheduleFor(network);

  const init = validateInit({
    schema: INIT_SCHEMA,
    ceremony_id: `synthetic-${network}`,
    created_at: schedule.createdAt.toISOString(),
    ptau: { file: PTAU.file, blake2b512: PTAU.blake2b512, size: PTAU.sizeBytes },
    tooling: {
      snarkjs: TOOLING.snarkjs,
      circom: TOOLING.circom,
      circomlib: "2.0.5",
      circom_flags: options.circomFlags ?? [...TOOLING.circomFlags],
    },
    source: { ref: release.tag, commit: release.commit },
    circuits: await Promise.all(
      // In session order, as `init` writes them.
      circuits
        .toSorted((a, b) => shapeOf(a).constraints - shapeOf(b).constraints)
        .map(async (c) => ({
          name: c,
          circuit_id: shapeOf(c).id,
          ceremony_version: shapeOf(c).version,
          r1cs_sha256: await put(dir, `r1cs/${c}.r1cs`, fake(`${c} r1cs`)),
          constraints: shapeOf(c).constraints,
          public_signals: shapeOf(c).publicSignals,
          wires: shapeOf(c).constraints + 1,
          domain_power: domainPower({
            constraints: shapeOf(c).constraints,
            publicOutputs: shapeOf(c).publicSignals,
            publicInputs: 0,
          }),
          genesis_sha256: await put(dir, `genesis/${c}.genesis.zkey`, fake(`${c} genesis`)),
          cs_hash: hex(64),
        })),
    ),
  });
  const initBytes = utf8(serializeJson(init));
  await writeAtomic(paths.init, initBytes);

  const announcement = buildAnnouncement({
    ceremonyId: init.ceremony_id,
    network,
    initSha256: sha256Hex(initBytes),
    circuitsSource: { repo: CIRCUITS_REPO_URL, ...release },
    minContributions: contributors,
    open: schedule.open,
    close: schedule.close,
    beaconDelaySeconds: schedule.beaconDelaySeconds,
  });
  const announcementBytes = utf8(serializeJson(announcement));
  await writeAtomic(paths.announcement, announcementBytes);
  const announcementSha256 = sha256Hex(announcementBytes);

  const genesis = chainGenesis(init.ceremony_id, announcement);
  const records: Chained[] = [];
  const at = new Date(T_ROUND - 30 * 60_000).toISOString();
  const previous = new Map(init.circuits.map((c) => [c.name, c.genesis_sha256]));
  for (let seq = 1; seq <= contributors; seq++) {
    for (const c of circuits) {
      /* oxlint-disable no-await-in-loop -- the chain is sequential */
      const output = await put(dir, `contributions/${c}/${seq}.zkey`, fake(`${c} #${seq}`));
      const log = await put(dir, `logs/${c}/${seq}.log`, fake(`${c} log ${seq}`));
      /* oxlint-enable no-await-in-loop */
      const h = hex(64);
      const record = buildContributionRecord({
        ceremonyId: init.ceremony_id,
        seq,
        circuit: c,
        index: seq,
        claimed: {
          inputSha256: previous.get(c) as string,
          outputSha256: output,
          contributionHash: h,
          method: "cli",
          client: { name: "orbinum-ceremony-cli", version: "0.0.0", commit: LOCAL_BUILD },
        },
        verified: {
          contributionHash: h,
          zkeyName: `local-${seq}`,
          deltaAfter: hex(64),
          logSha256: log,
          verifierVersion: LOCAL_VERIFIER,
          snarkjsVersion: TOOLING.snarkjs,
        },
        contributor: null,
        at,
      });
      records.push(appendRecord(records, genesis, record));
      previous.set(c, output);
    }
  }

  const transcript = transcriptOf(init.ceremony_id, announcementSha256, records);
  if (options.finalized ?? true) {
    const beacon = buildBeaconRecord({
      ceremonyId: init.ceremony_id,
      chainHash: DRAND.chainHash,
      round: ROUND_1000,
      iterationsExp: announcement.beacon.iterations_exp,
      relays: ["https://relay-a.example", "https://relay-b.example"],
      sealedAt: new Date(T_ROUND + 30_000).toISOString(),
    });
    records.push(appendRecord(records, genesis, beacon));
    for (const c of init.circuits) {
      /* oxlint-disable no-await-in-loop -- a few files */
      const zkey = await put(dir, `final/${c.name}.final.zkey`, fake(`${c.name} final`));
      const vk = await put(dir, `final/${c.name}.vk.json`, utf8(`{"synthetic":"${hex(8)}"}\n`));
      /* oxlint-enable no-await-in-loop */
      transcript.finals.push(
        buildFinalRecord({
          circuit: c.name,
          contributions: contributors,
          finalZkeySha256: zkey,
          vkJsonSha256: vk,
          vkHash: network === "local" ? null : vkHashOf(utf8(vk)),
          csHash: c.cs_hash,
          finalChain: headChain(records, genesis),
        }),
      );
    }
  }
  await writeJson(paths.transcript, transcript);
  return { dir, init, announcement, announcementSha256, transcript };
}
