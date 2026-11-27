/** Parses `download` argv; a bad option is a `UsageError`. */
import { endpointOption, parseOptions, pathOption, required, sha256Option } from "../../args";
import type { DownloadOptions } from "./types";

export function parseDownloadOptions(argv: string[]): DownloadOptions {
  const values = parseOptions(argv, {
    from: { type: "string" },
    dir: { type: "string" },
    "announcement-sha256": { type: "string" },
    "transcript-sha256": { type: "string" },
    "with-ptau": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  });
  return {
    from: endpointOption(required(values.from, "from"), "from"),
    dir: pathOption(required(values.dir, "dir")),
    announcementSha256: sha256Option(
      required(values["announcement-sha256"], "announcement-sha256"),
      "announcement-sha256",
    ),
    ...(values["transcript-sha256"] === undefined
      ? {}
      : { transcriptSha256: sha256Option(values["transcript-sha256"], "transcript-sha256") }),
    withPtau: values["with-ptau"],
    force: values.force,
  };
}
