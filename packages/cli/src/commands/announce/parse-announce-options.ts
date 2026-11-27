/**
 * Parses `announce` argv; a bad option is a `UsageError`. `--invite` takes comma-separated numeric
 * GitHub ids (repeats dropped) and `--closed` limits admission to them. These rules exist only for
 * a readable error: core's announcement validator has the last word.
 */
import {
  type Admission,
  asOneOf,
  CIRCUITS_REPO_URL,
  DEFAULT_BEACON_DELAY_SECONDS,
  MAX_BEACON_DELAY_SECONDS,
  MAX_CONTRIBUTIONS,
  MAX_INVITED,
  MIN_BEACON_DELAY_SECONDS,
  type Network,
  NETWORKS,
} from "@orbinum-ceremony/core";
import { intOption, parseOptions, pathOption, required, UsageError } from "../../args";
import type { AnnounceOptions } from "./types";

const date = (value: string, flag: string): Date => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new UsageError(`--${flag} is not a valid date`);
  return d;
};

const GITHUB_ID = /^[1-9][0-9]{0,15}$/;

function invitedOption(value: string): number[] {
  const ids = value.split(",").map((id) => id.trim());
  if (!ids.every((id) => GITHUB_ID.test(id) && Number.isSafeInteger(Number(id)))) {
    throw new UsageError("--invite must list numeric GitHub ids, comma-separated");
  }
  const invited = [...new Set(ids.map(Number))];
  if (invited.length > MAX_INVITED) {
    throw new UsageError(`--invite lists more than ${MAX_INVITED} accounts`);
  }
  return invited;
}

function admissionOption(
  invite: string | undefined,
  closed: boolean,
  network: Network,
  minContributions: number,
): Admission | undefined {
  if (invite === undefined) {
    if (closed) throw new UsageError("--closed needs --invite: the accounts that may join");
    return undefined;
  }
  const invited = invitedOption(invite);
  if (!closed) return { mode: "open", invited };
  if (network === "mainnet") throw new UsageError("--closed is for rehearsals, never mainnet");
  if (invited.length < minContributions) {
    throw new UsageError(
      `--closed needs at least --min-contributions (${minContributions}) invited accounts`,
    );
  }
  return { mode: "closed", invited };
}

export function parseAnnounceOptions(argv: string[]): AnnounceOptions {
  const values = parseOptions(argv, {
    dir: { type: "string" },
    network: { type: "string" },
    "circuits-repo": { type: "string" },
    "circuits-tag": { type: "string" },
    "circuits-url": { type: "string", default: CIRCUITS_REPO_URL },
    "min-contributions": { type: "string" },
    open: { type: "string" },
    close: { type: "string" },
    "beacon-delay": { type: "string", default: String(DEFAULT_BEACON_DELAY_SECONDS) },
    invite: { type: "string" },
    closed: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  });
  let network: Network;
  try {
    network = asOneOf(required(values.network, "network"), "--network", NETWORKS);
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`--network must be one of ${NETWORKS.join(", ")}`);
  }
  const circuitsUrl = values["circuits-url"];
  if (network !== "local" && circuitsUrl !== CIRCUITS_REPO_URL) {
    throw new UsageError(`--circuits-url must be ${CIRCUITS_REPO_URL} on ${network}`);
  }
  const minContributions = intOption(
    required(values["min-contributions"], "min-contributions"),
    "min-contributions",
    1,
    MAX_CONTRIBUTIONS,
  );
  const admission = admissionOption(values.invite, values.closed, network, minContributions);
  return {
    dir: pathOption(required(values.dir, "dir")),
    network,
    circuitsRepo: pathOption(required(values["circuits-repo"], "circuits-repo")),
    circuitsTag: required(values["circuits-tag"], "circuits-tag"),
    circuitsUrl,
    minContributions,
    open: values.open ? date(values.open, "open") : new Date(),
    close: date(required(values.close, "close"), "close"),
    beaconDelaySeconds: intOption(
      values["beacon-delay"],
      "beacon-delay",
      MIN_BEACON_DELAY_SECONDS[network],
      MAX_BEACON_DELAY_SECONDS,
    ),
    ...(admission ? { admission } : {}),
    force: values.force,
  };
}
