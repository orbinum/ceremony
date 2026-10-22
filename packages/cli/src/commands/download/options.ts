/** `download` options. */
import { endpointOption, parseOptions, pathOption, required, sha256Option } from "../../args";

/** Where to mirror from and to, and the pin everything is checked from. */
export interface DownloadOptions {
  /** Base URL of the published ceremony (the public bucket). */
  from: string;
  dir: string;
  /** SHA-256 of ceremony.json from an official channel: every other file is checked from it. */
  announcementSha256: string;
  /** Also fetch the ptau mirror (75 MB), checked against its pinned BLAKE2b-512. */
  withPtau: boolean;
  /** Replace a local transcript the new one does not extend (a sealed beacon, finals). */
  force: boolean;
}

/** Usage text, printed by `--help` and on a usage error. */
export const DOWNLOAD_USAGE = `orbinum-ceremony download --from <published https URL> --dir <out dir> --announcement-sha256 <hex>
    Mirrors a published ceremony into a directory that \`verify\` reads. Nothing unverified is
    kept: ceremony.json must have the pinned SHA-256, init.json the one it announces, r1cs and
    genesis files the hashes in init.json, and the transcript must be anchored in that
    ceremony.json with an intact chain before any file it names is fetched.
    A local transcript is only replaced by one that extends it: never by an older one, nor one
    without its sealed beacon or finals.
    [--with-ptau]   also fetch ptau/ (checked against the pinned BLAKE2b-512)
    [--force]       replace the local transcript even when the new one does not extend it`;

/** Parses argv; a bad option is a `UsageError`. */
export function parseDownloadOptions(argv: string[]): DownloadOptions {
  const values = parseOptions(argv, {
    from: { type: "string" },
    dir: { type: "string" },
    "announcement-sha256": { type: "string" },
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
    withPtau: values["with-ptau"],
    force: values.force,
  };
}
