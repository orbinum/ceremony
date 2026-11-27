/** Parses `verify` argv; a bad option is a `UsageError`. */
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
import type { VerifyOptions } from "./types";

export function parseVerifyOptions(argv: string[]): VerifyOptions {
  const values = parseOptions(argv, {
    dir: { type: "string" },
    "announcement-sha256": { type: "string" },
    network: { type: "string" },
    "transcript-sha256": { type: "string" },
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
  const transcriptSha256 =
    values["transcript-sha256"] === undefined
      ? undefined
      : sha256Option(values["transcript-sha256"], "transcript-sha256");
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
    ...(transcriptSha256 ? { transcriptSha256 } : {}),
    ...(circuitsRepo ? { circuitsRepo } : {}),
    ...(vkPacker ? { vkPacker } : {}),
    ...(rustVerifier ? { rustVerifier } : {}),
    ...(report ? { report } : {}),
  };
}
