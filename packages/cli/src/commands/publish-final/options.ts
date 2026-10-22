/** `publish-final` options. */
import { endpointOption, parseOptions, pathOption, required } from "../../args";

/** The finalized ceremony directory and the coordinator to hand it to. */
export interface PublishFinalOptions {
  dir: string;
  /** The coordinator's origin; its `/admin/*` routes are behind Cloudflare Access. */
  coordinator: string;
}

/** Usage text, printed by `--help` and on a usage error. */
export const PUBLISH_FINAL_USAGE = `orbinum-ceremony publish-final --dir <finalized ceremony dir> --coordinator <https url>
    After \`finalize\`: uploads every final/ file (each checked against its final record first, and
    the bytes checked are the bytes uploaded), then hands the sealed beacon and the final records
    to the coordinator, which checks them against its transcript and freezes the ceremony.
    Re-running it after a success changes nothing. A Cloudflare Access service token is read from
    CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET and sent only over https (not needed for a
    local coordinator, the only one reachable over http).`;

/** Parses argv; a bad option is a `UsageError`. */
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
