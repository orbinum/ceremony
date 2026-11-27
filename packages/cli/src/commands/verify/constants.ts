/** The `verify` usage text, printed by `--help` and on a usage error. */
import { CEREMONY_LAYOUT, NETWORKS } from "@orbinum-ceremony/core";

export const VERIFY_USAGE = `orbinum-ceremony verify --dir <published ceremony dir>
    --announcement-sha256 <hex>  SHA-256 of ceremony.json from an official channel (root of trust)
    --network <${NETWORKS.join("|")}>
                                 the network you expect; an announcement for another one fails
    --circuits-repo <path>       your own clone of the circuits repo (its origin must be the announced
                                 repo), checked out at the announced tag and installed from it first with
                                 \`pnpm install --frozen-lockfile --ignore-scripts\`; the tag is resolved,
                                 compared with its manifest and recompiled (required unless --local)
    --vk-packer <bin>            groth16-proofs pack-verifying-key, recomputes vk_hash (required unless --local)
    --rust-verifier <bin>        ceremony-verifier (github.com/orbinum/ceremony-verifier): re-verifies
                                 every final key and re-derives its genesis from r1cs + ptau without
                                 snarkjs code (required unless --local)
    [--transcript-sha256 <hex>]  SHA-256 of transcript.json from an official channel; another one fails.
                                 The summary always prints it and each circuit's vk_hash to compare
    [--ptau <file>]              default: <dir>/${CEREMONY_LAYOUT.ptau}
    [--rebuild-genesis]          also rebuild every genesis with snarkjs and require identical bytes
    [--report <file>]            also write the full report as JSON
    [--local]                    local ceremony: allow skipping checks that need external inputs`;
