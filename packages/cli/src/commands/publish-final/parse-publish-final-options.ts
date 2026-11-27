/** Parses `publish-final` argv; a bad option is a `UsageError`. */
import { endpointOption, parseOptions, pathOption, required } from "../../args";
import type { PublishFinalOptions } from "./types";

export function parsePublishFinalOptions(argv: string[]): PublishFinalOptions {
  const values = parseOptions(argv, {
    dir: { type: "string" },
    coordinator: { type: "string" },
  });
  return {
    dir: pathOption(required(values.dir, "dir")),
    coordinator: new URL(endpointOption(required(values.coordinator, "coordinator"), "coordinator"))
      .origin,
  };
}
