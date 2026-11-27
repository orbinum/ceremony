/** The `init` usage text, printed by `--help` and on a usage error. */

export const INIT_USAGE = `orbinum-ceremony init --ceremony-id <id> --circuits-repo <path> --circuits-ref <tag>
      --circuit-ids <name>=<id>[,<name>=<id>…]
                             the circuits of the ceremony, each with its on-chain CircuitId
                             (e.g. shield=3,unshield=2,transfer=1); each must be in the release's
                             manifest.json, whose active version + 1 the ceremony key becomes
    [--out <dir>]            default: artifacts/<ceremony-id>
    [--ptau <file>]          use a local ptau instead of downloading it (hash is still checked)
    [--check-determinism]    build every genesis twice and require identical bytes (A1/A3)
    [--force]                rebuild a ceremony directory not yet announced or contributed to
    [--beyond-measured-bounds]
                             accept circuits larger than the session and verifier bounds were
                             measured for, once those bounds have been re-measured and raised`;
