/** `finalize` options. */
import { join } from "node:path";
import { CEREMONY_LAYOUT } from "@orbinum-ceremony/core";
import { optionalPath, parseOptions, pathOption, required } from "../../args";

/** The ceremony to finalize, its ptau and the vk packer. */
export interface FinalizeOptions {
  dir: string;
  ptau: string;
  vkPacker?: string;
}

/** Usage text, printed by `--help` and on a usage error. */
export const FINALIZE_USAGE = `orbinum-ceremony finalize --dir <ceremony dir>
    [--ptau <file>]          default: <dir>/${CEREMONY_LAYOUT.ptau}
    [--vk-packer <bin>]      groth16-proofs pack-verifying-key; required unless the network is local
The beacon round is the one ceremony.json announced; it cannot be chosen here.`;

/** Parses argv; a bad option is a `UsageError`. */
export function parseFinalizeOptions(argv: string[]): FinalizeOptions {
  const values = parseOptions(argv, {
    dir: { type: "string" },
    ptau: { type: "string" },
    "vk-packer": { type: "string" },
  });
  const dir = pathOption(required(values.dir, "dir"));
  const vkPacker = optionalPath(values["vk-packer"]);
  return {
    dir,
    ptau: pathOption(values.ptau ?? join(dir, CEREMONY_LAYOUT.ptau)),
    ...(vkPacker ? { vkPacker } : {}),
  };
}
