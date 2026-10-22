/** `verify` options. */
import { join } from "node:path";
import { asOneOf, CEREMONY_LAYOUT, type Network, NETWORKS } from "@orbinum-ceremony/core";
import {
  optionalPath,
  parseOptions,
  pathOption,
  required,
  sha256Option,
  UsageError,
} from "../../args";
import type { LimitsOverride } from "../../tools";

/**
 * The published directory, the pin it is rooted in, and the external inputs of a full verification.
 */
export interface VerifyOptions {
  dir: string;
  /** SHA-256 of ceremony.json obtained from an official channel: the root of trust. */
  announcementSha256: string;
  /** The network the verifier expects: an announcement for another one fails. */
  network: Network;
  ptau: string;
  circuitsRepo?: string;
  rebuildGenesis: boolean;
  vkPacker?: string;
  /** The independent Rust verifier binary (SPEC §8.4). */
  rustVerifier?: string;
  report?: string;
  /** Local ceremonies only: security checks that need external inputs may be skipped. */
  local: boolean;
  /** Lowers the bounds of each snarkjs call below its class defaults (programmatic only: tests). */
  snarkjsLimits?: LimitsOverride;
}

/** Usage text, printed by `--help` and on a usage error. */
export const VERIFY_USAGE = `orbinum-ceremony verify --dir <published ceremony dir>
    --announcement-sha256 <hex>  SHA-256 of ceremony.json from an official channel (root of trust)
    --network <${NETWORKS.join("|")}>
                                 the network you expect; an announcement for another one fails
    --circuits-repo <path>       your own clone of the circuits repo (its origin must be the announced
                                 repo); the announced tag is resolved, compared with its manifest and
                                 recompiled (required unless --local)
    --vk-packer <bin>            groth16-proofs pack-verifying-key, recomputes vk_hash (required unless --local)
    --rust-verifier <bin>        ceremony-verifier (github.com/orbinum/ceremony-verifier): re-verifies
                                 every final key and re-derives its genesis from r1cs + ptau without
                                 snarkjs code (required unless --local)
    [--ptau <file>]              default: <dir>/${CEREMONY_LAYOUT.ptau}
    [--rebuild-genesis]          also rebuild every genesis with snarkjs and require identical bytes
    [--report <file>]            also write the full report as JSON
    [--local]                    local ceremony: allow skipping checks that need external inputs`;

/** Parses argv; a bad option is a `UsageError`. */
export function parseVerifyOptions(argv: string[]): VerifyOptions {
  const values = parseOptions(argv, {
    dir: { type: "string" },
    "announcement-sha256": { type: "string" },
    network: { type: "string" },
    ptau: { type: "string" },
    "circuits-repo": { type: "string" },
    "rebuild-genesis": { type: "boolean", default: false },
    "vk-packer": { type: "string" },
    "rust-verifier": { type: "string" },
    report: { type: "string" },
    local: { type: "boolean", default: false },
  });
  const dir = pathOption(required(values.dir, "dir"));
  const circuitsRepo = optionalPath(values["circuits-repo"]);
  const vkPacker = optionalPath(values["vk-packer"]);
  const rustVerifier = optionalPath(values["rust-verifier"]);
  const report = optionalPath(values.report);
  let network: Network;
  try {
    network = asOneOf(required(values.network, "network"), "--network", NETWORKS);
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`--network must be one of ${NETWORKS.join(", ")}`);
  }
  return {
    dir,
    announcementSha256: sha256Option(
      required(values["announcement-sha256"], "announcement-sha256"),
      "announcement-sha256",
    ),
    network,
    ptau: pathOption(values.ptau ?? join(dir, CEREMONY_LAYOUT.ptau)),
    rebuildGenesis: values["rebuild-genesis"],
    local: values.local,
    ...(circuitsRepo ? { circuitsRepo } : {}),
    ...(vkPacker ? { vkPacker } : {}),
    ...(rustVerifier ? { rustVerifier } : {}),
    ...(report ? { report } : {}),
  };
}
