/** `publish-init` options. */
import { endpointOption, parseOptions, pathOption, required } from "../../args";

/** The ceremony directory, the coordinator and the ptau to mirror. */
export interface PublishInitOptions {
  dir: string;
  /** The coordinator's origin; its `/admin/*` routes are behind Cloudflare Access. */
  coordinator: string;
  ptau: string;
}

/** Usage text, printed by `--help` and on a usage error. */
export const PUBLISH_INIT_USAGE = `orbinum-ceremony publish-init --dir <ceremony dir> --coordinator <https url> --ptau <file>
    Uploads genesis/ (init.json + genesis zkeys), r1cs/, the ptau mirror and, last, ceremony.json
    to the public bucket through the coordinator, then freezes the setup in it. Every file is
    checked against its pin first, and the bytes checked are the bytes uploaded. A Cloudflare
    Access service token is read from CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET and sent
    only over https (not needed for a local coordinator, the only one reachable over http).`;

/** Parses argv; a bad option is a `UsageError`. */
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
