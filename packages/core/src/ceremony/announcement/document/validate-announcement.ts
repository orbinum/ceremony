/**
 * `ceremony.json` read from outside: exact schema, the pinned drand chain, a beacon round that is
 * exactly the first round at or after the announced beacon time, a schedule in order with the
 * network's beacon delay, the audited circuits repository outside local ceremonies, the minimum
 * contributions for the network, and invitations a closed ceremony can complete with (each account
 * contributes once per circuit, so fewer invited than the minimum could never finish). Invited
 * ids must be ascending without repeats, so there is one canonical form.
 */
import {
  BEACON_ITERATIONS_EXP,
  BEACON_ITERATIONS_RANGE,
  CIRCUITS_REPO_URL,
  DRAND,
  MAINNET_MIN_CONTRIBUTIONS,
  MAX_CONTRIBUTIONS,
  MAX_INVITED,
  MIN_BEACON_DELAY_SECONDS,
} from "../../../config";
import { FormatError } from "../../../primitives/errors";
import {
  asArray,
  asCeremonyId,
  asCommit,
  asHex,
  asIsoTime,
  asObject,
  asOneOf,
  asPositiveInt,
  asRecord,
  asSafeInt,
  asSchema,
  asString,
  TOKEN,
} from "../../../primitives/schema";
import { roundAt } from "../../beacon";
import { asTag } from "./as-tag";
import { ADMISSION_MODES, ANNOUNCEMENT_SCHEMA, NETWORKS } from "../constants";
import type { Admission, CeremonyAnnouncement } from "../types";

const fail = (message: string): never => {
  throw new FormatError(`announcement: ${message}`);
};

const KEYS = [
  "schema",
  "ceremony_id",
  "network",
  "init_sha256",
  "circuits_source",
  "min_contributions",
  "schedule",
  "beacon",
] as const;

function asAdmission(v: unknown): Admission {
  const o = asRecord(v, "announcement.admission", ["mode", "invited"]);
  const invited = asArray(o.invited, "announcement.admission.invited", MAX_INVITED, 1).map(
    (id, i) => asPositiveInt(id, `announcement.admission.invited[${i}]`),
  );
  if (invited.some((id, i) => i > 0 && id <= (invited[i - 1] ?? 0))) {
    fail("admission.invited must be strictly ascending");
  }
  return { mode: asOneOf(o.mode, "announcement.admission.mode", ADMISSION_MODES), invited };
}

export function validateAnnouncement(v: unknown): CeremonyAnnouncement {
  const invites = Object.hasOwn(asObject(v, "announcement"), "admission");
  const o = asRecord(v, "announcement", invites ? [...KEYS, "admission"] : KEYS);
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
    ...(invites ? { admission: asAdmission(o.admission) } : {}),
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
  if (a.admission?.mode === "closed") {
    if (a.network === "mainnet") fail("a mainnet ceremony cannot be closed");
    if (a.admission.invited.length < a.min_contributions) {
      fail(`a closed ceremony must invite at least min_contributions (${a.min_contributions})`);
    }
  }
  return a;
}
