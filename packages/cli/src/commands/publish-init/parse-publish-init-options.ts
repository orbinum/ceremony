/** Parses `publish-init` argv; a bad option is a `UsageError`. */
import { endpointOption, parseOptions, pathOption, required } from "../../args";
import type { PublishInitOptions } from "./types";

export function parsePublishInitOptions(argv: string[]): PublishInitOptions {
  const values = parseOptions(argv, {
    dir: { type: "string" },
    coordinator: { type: "string" },
    ptau: { type: "string" },
  });
  return {
    dir: pathOption(required(values.dir, "dir")),
    coordinator: new URL(endpointOption(required(values.coordinator, "coordinator"), "coordinator"))
      .origin,
    ptau: pathOption(required(values.ptau, "ptau")),
  };
}
