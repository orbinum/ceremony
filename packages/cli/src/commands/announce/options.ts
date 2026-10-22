/** `announce` options. */
import {
  asOneOf,
  CIRCUITS_REPO_URL,
  DEFAULT_BEACON_DELAY_SECONDS,
  MAX_BEACON_DELAY_SECONDS,
  MAX_CONTRIBUTIONS,
  MIN_BEACON_DELAY_SECONDS,
  type Network,
  NETWORKS,
} from "@orbinum-ceremony/core";
import { intOption, parseOptions, pathOption, required, UsageError } from "../../args";

/** What the operator decides for the announcement. */
export interface AnnounceOptions {
  dir: string;
  network: Network;
  circuitsRepo: string;
  circuitsTag: string;
  circuitsUrl: string;
  minContributions: number;
  open: Date;
  close: Date;
  beaconDelaySeconds: number;
  force: boolean;
}

/** Usage text, printed by `--help` and on a usage error. */
export const ANNOUNCE_USAGE = `orbinum-ceremony announce --dir <ceremony dir> --network <${NETWORKS.join("|")}>
      --circuits-repo <path> --circuits-tag <tag> --min-contributions <n> --close <ISO time>
    [--open <ISO time>]          default: now
    [--beacon-delay <seconds>]   default: ${DEFAULT_BEACON_DELAY_SECONDS} (the beacon round is the first one after close + delay);
                                 at least ${MIN_BEACON_DELAY_SECONDS.testnet} on testnet, ${MIN_BEACON_DELAY_SECONDS.mainnet} on mainnet
    [--circuits-url <url>]       default: ${CIRCUITS_REPO_URL} (the only one outside local)
    [--force]                    overwrite an existing ceremony.json (only before it is published,
                                 never once a transcript exists)`;

const date = (value: string, flag: string): Date => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new UsageError(`--${flag} is not a valid date`);
  return d;
};

/** Parses argv; a bad option is a `UsageError`. */
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
    force: { type: "boolean", default: false },
  });
  let network: Network;
  try {
    network = asOneOf(required(values.network, "network"), "--network", NETWORKS);
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`--network must be one of ${NETWORKS.join(", ")}`);
  }
  // Rules here are only for a readable error; core's announcement validator has the last word.
  const circuitsUrl = values["circuits-url"];
  if (network !== "local" && circuitsUrl !== CIRCUITS_REPO_URL) {
    throw new UsageError(`--circuits-url must be ${CIRCUITS_REPO_URL} on ${network}`);
  }
  return {
    dir: pathOption(required(values.dir, "dir")),
    network,
    circuitsRepo: pathOption(required(values["circuits-repo"], "circuits-repo")),
    circuitsTag: required(values["circuits-tag"], "circuits-tag"),
    circuitsUrl,
    minContributions: intOption(
      required(values["min-contributions"], "min-contributions"),
      "min-contributions",
      1,
      MAX_CONTRIBUTIONS,
    ),
    open: values.open ? date(values.open, "open") : new Date(),
    close: date(required(values.close, "close"), "close"),
    beaconDelaySeconds: intOption(
      values["beacon-delay"],
      "beacon-delay",
      MIN_BEACON_DELAY_SECONDS[network],
      MAX_BEACON_DELAY_SECONDS,
    ),
    force: values.force,
  };
}
