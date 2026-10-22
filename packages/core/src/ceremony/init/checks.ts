/**
 * `init.json` against the announcement, the pinned config and the audited release. SPEC §2.1, §6.2.
 */
import { CIRCUIT_ORDER, CIRCUITS, type CircuitName, PTAU, TOOLING } from "../../config";
import type { CeremonyAnnouncement } from "../announcement";
import type { PublishedCircuit } from "./release";
import type { InitCircuit, InitRecord } from "./types";

/** The ceremony's circuits, in session order. */
export const circuitsOf = (init: InitRecord): CircuitName[] =>
  CIRCUIT_ORDER.filter((n) => init.circuits.some((c) => c.name === n));

/** One circuit's entry; throws if the ceremony does not have it. */
export function circuitOf(init: InitRecord, name: CircuitName): InitCircuit {
  const c = init.circuits.find((x) => x.name === name);
  if (!c) throw new Error(`${name} is not in init.json`);
  return c;
}

/** The SHA-256 a file of `circuit` must have. */
export const pinOf = (init: InitRecord, circuit: CircuitName, kind: "genesis" | "r1cs"): string =>
  kind === "genesis"
    ? circuitOf(init, circuit).genesis_sha256
    : circuitOf(init, circuit).r1cs_sha256;

/**
 * The init the announcement pins: byte-for-byte (`initSha256` of the exact file), same ceremony,
 * built from the announced circuits commit.
 */
export function checkInitAgainstAnnouncement(
  announcement: CeremonyAnnouncement,
  init: InitRecord,
  initSha256: string,
): string[] {
  const problems: string[] = [];
  if (initSha256 !== announcement.init_sha256) {
    problems.push("init.json is not the one ceremony.json announced");
  }
  if (init.ceremony_id !== announcement.ceremony_id) {
    problems.push("init.json and ceremony.json name different ceremonies");
  }
  if (init.source.commit !== announcement.circuits_source.commit) {
    problems.push("init.json was not built from the announced circuits commit");
  }
  return problems;
}

/** Pins the config fixes: the ptau, the tooling, and each circuit's id and ceremony version. */
export function checkInitAgainstConfig(init: InitRecord): string[] {
  const problems: string[] = [];
  const p = init.ptau;
  if (p.file !== PTAU.file || p.blake2b512 !== PTAU.blake2b512 || p.size !== PTAU.sizeBytes) {
    problems.push("ptau is not the pinned file");
  }
  const t = init.tooling;
  if (t.snarkjs !== TOOLING.snarkjs)
    problems.push(`snarkjs ${t.snarkjs}, pinned ${TOOLING.snarkjs}`);
  if (t.circom !== TOOLING.circom) problems.push(`circom ${t.circom}, pinned ${TOOLING.circom}`);
  if (t.circom_flags.join(" ") !== TOOLING.circomFlags.join(" ")) {
    problems.push(
      `circom flags ${t.circom_flags.join(" ")}, pinned ${TOOLING.circomFlags.join(" ")}`,
    );
  }
  for (const c of init.circuits) {
    const pinned = CIRCUITS[c.name];
    if (pinned.id !== c.circuit_id || pinned.ceremonyVersion !== c.ceremony_version) {
      problems.push(`${c.name}: id/version differ from the pinned config`);
    }
  }
  return problems;
}

/** A full ceremony covers every pinned circuit (a rehearsal may cover fewer). */
export const checkInitCoverage = (init: InitRecord): string[] =>
  CIRCUIT_ORDER.flatMap((n) => (init.circuits.some((c) => c.name === n) ? [] : [`${n} missing`]));

/** The r1cs is the one the audited release published, at the version the config pins. */
export function checkRelease(
  published: PublishedCircuit,
  c: Pick<InitCircuit, "name" | "r1cs_sha256">,
): string[] {
  const problems: string[] = [];
  if (published.r1csSha256 !== c.r1cs_sha256)
    problems.push("r1cs is not the one the release published");
  if (published.version !== CIRCUITS[c.name].devVersion) {
    problems.push(
      `release has v${published.version}, config expects v${CIRCUITS[c.name].devVersion}`,
    );
  }
  return problems;
}
