/** The `announce` usage text, printed by `--help` and on a usage error. */
import {
  CIRCUITS_REPO_URL,
  DEFAULT_BEACON_DELAY_SECONDS,
  MAX_INVITED,
  MIN_BEACON_DELAY_SECONDS,
  NETWORKS,
} from "@orbinum-ceremony/core";

export const ANNOUNCE_USAGE = `orbinum-ceremony announce --dir <ceremony dir> --network <${NETWORKS.join("|")}>
      --circuits-repo <path> --circuits-tag <tag> --min-contributions <n> --close <ISO time>
    [--open <ISO time>]          default: now
    [--beacon-delay <seconds>]   default: ${DEFAULT_BEACON_DELAY_SECONDS} (the beacon round is the first one after close + delay);
                                 at least ${MIN_BEACON_DELAY_SECONDS.testnet} on testnet, ${MIN_BEACON_DELAY_SECONDS.mainnet} on mainnet
    [--circuits-url <url>]       default: ${CIRCUITS_REPO_URL} (the only one outside local)
    [--invite <id,id,...>]       numeric GitHub ids (gh api users/<login> --jq .id) that join ahead
                                 of everyone else; at most ${MAX_INVITED}
    [--closed]                   only the --invite accounts may join (local and testnet rehearsals)
    [--force]                    overwrite an existing ceremony.json (only before it is published,
                                 never once a transcript exists)`;
