/**
 * `ceremony.json` read from outside: exact schema and canonical bytes, the pinned drand chain, a
 * beacon round that is exactly the first round at or after the announced beacon time, a schedule
 * in order with the network's beacon delay, the audited circuits repository outside local
 * ceremonies, and the minimum contributions for the network. SPEC §2.1, §5.2, §6.2.
 */
import {
  BEACON_ITERATIONS_EXP,
  BEACON_ITERATIONS_RANGE,
  CIRCUITS_REPO_URL,
  DRAND,
  MAINNET_MIN_CONTRIBUTIONS,
  MAX_CONTRIBUTIONS,
  MIN_BEACON_DELAY_SECONDS,
} from "../../config";
import { parseCanonicalJson } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import {
  asCeremonyId,
  asCommit,
  asHex,
  asIsoTime,
  asOneOf,
  asPositiveInt,
  asRecord,
  asSafeInt,
  asSchema,
  asString,
  TOKEN,
} from "../../primitives/schema";
import { roundAt } from "../beacon";
import { ANNOUNCEMENT_SCHEMA, type CeremonyAnnouncement, NETWORKS } from "./types";

const fail = (message: string): never => {
  throw new FormatError(`announcement: ${message}`);
};

/** Validates the document and its cross-field rules. */
export function validateAnnouncement(v: unknown): CeremonyAnnouncement {
  const o = asRecord(v, "announcement", [
    "schema",
    "ceremony_id",
    "network",
    "init_sha256",
    "circuits_source",
    "min_contributions",
    "schedule",
    "beacon",
  ]);
  const src = asRecord(o.circuits_source, "announcement.circuits_source", [
    "repo",
    "tag",
    "commit",
  ]);
  const sched = asRecord(o.schedule, "announcement.schedule", ["open", "close", "beacon"]);
  const b = asRecord(o.beacon, "announcement.beacon", [
    "network",
    "chain_hash",
    "round",
    "iterations_exp",
  ]);

  const a: CeremonyAnnouncement = {
    schema: asSchema(o.schema, "announcement.schema", ANNOUNCEMENT_SCHEMA),
    ceremony_id: asCeremonyId(o.ceremony_id, "announcement.ceremony_id"),
    network: asOneOf(o.network, "announcement.network", NETWORKS),
    init_sha256: asHex(o.init_sha256, "announcement.init_sha256", 32),
    circuits_source: {
      repo: asString(src.repo, "announcement.circuits_source.repo", 200, TOKEN),
      tag: asTag(src.tag, "announcement.circuits_source.tag"),
      commit: asCommit(src.commit, "announcement.circuits_source.commit"),
    },
    min_contributions: asSafeInt(
      o.min_contributions,
      "announcement.min_contributions",
      1,
      MAX_CONTRIBUTIONS,
    ),
    schedule: {
      open: asIsoTime(sched.open, "announcement.schedule.open"),
      close: asIsoTime(sched.close, "announcement.schedule.close"),
      beacon: asIsoTime(sched.beacon, "announcement.schedule.beacon"),
    },
    beacon: {
      network: asOneOf(b.network, "announcement.beacon.network", [DRAND.network]),
      chain_hash: asHex(b.chain_hash, "announcement.beacon.chain_hash", 32),
      round: asPositiveInt(b.round, "announcement.beacon.round"),
      iterations_exp: asSafeInt(
        b.iterations_exp,
        "announcement.beacon.iterations_exp",
        BEACON_ITERATIONS_RANGE.min,
        BEACON_ITERATIONS_RANGE.max,
      ),
    },
  };

  const open = Date.parse(a.schedule.open);
  const close = Date.parse(a.schedule.close);
  const beaconAt = Date.parse(a.schedule.beacon);
  if (!(open < close && close <= beaconAt)) fail("schedule must satisfy open < close ≤ beacon");
  const minDelay = MIN_BEACON_DELAY_SECONDS[a.network];
  if (beaconAt - close < minDelay * 1000) {
    fail(`the beacon must come at least ${minDelay} s after close on ${a.network}`);
  }
  if (a.network !== "local" && a.circuits_source.repo !== CIRCUITS_REPO_URL) {
    fail(`circuits_source.repo must be ${CIRCUITS_REPO_URL} on ${a.network}`);
  }
  if (a.beacon.chain_hash !== DRAND.chainHash) fail("beacon is not the pinned drand chain");
  if (a.beacon.iterations_exp !== BEACON_ITERATIONS_EXP.drand) fail("unexpected beacon iterations");
  if (a.beacon.round !== roundAt(beaconAt / 1000)) {
    fail(`beacon round ${a.beacon.round} is not the first round at ${a.schedule.beacon}`);
  }
  if (a.network === "mainnet" && a.min_contributions < MAINNET_MIN_CONTRIBUTIONS) {
    fail(`mainnet requires at least ${MAINNET_MIN_CONTRIBUTIONS} contributions`);
  }
  return a;
}

/**
 * `ceremony.json` from its published text: valid, and byte-for-byte the canonical serialization
 * of its value, so the pinned bytes cannot carry duplicate keys or anything a reader sees but a
 * tool ignores.
 */
export const parseAnnouncement = (text: string): CeremonyAnnouncement =>
  parseCanonicalJson(text, "ceremony.json", validateAnnouncement);

/** A release tag name: never `HEAD`, a full ref, or a commit id spelled as a tag. */
export function asTag(value: unknown, path: string): string {
  const tag = asString(value, path, 100, /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/);
  if (tag === "HEAD" || tag.startsWith("refs/") || /^[0-9a-fA-F]{7,40}$/.test(tag)) {
    throw new FormatError(`${path}: not a tag name`);
  }
  return tag;
}
