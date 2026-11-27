/** Parses `finalize` argv; a bad option is a `UsageError`. */
import { join } from "node:path";
import { CEREMONY_LAYOUT } from "@orbinum-ceremony/core";
import { optionalPath, parseOptions, pathOption, required } from "../../args";
import type { FinalizeOptions } from "./types";

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
