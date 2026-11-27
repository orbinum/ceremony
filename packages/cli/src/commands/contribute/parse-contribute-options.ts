/**
 * Parses `contribute` argv and the environment; a bad option is a `UsageError`. The token is never
 * shown: the parser quotes what it refused, so a token pasted on the command line gets its own
 * error instead. A token's shape is a base64url body and a hex MAC; its content is the
 * coordinator's.
 */
import {
  endpointOption,
  parseOptions,
  pathOption,
  required,
  sha256Option,
  UsageError,
} from "../../args";
import { TOKEN_ENV } from "./constants";
import type { ContributeOptions } from "./types";

const TOKEN = /^[A-Za-z0-9_-]{1,1024}\.[0-9a-f]{64}$/;

export function parseContributeOptions(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): ContributeOptions {
  let values;
  try {
    values = parseOptions(argv, {
      coordinator: { type: "string" },
      "announcement-sha256": { type: "string" },
      work: { type: "string" },
    });
  } catch (error) {
    if (argv.some((a) => TOKEN.test(a.slice(a.indexOf("=") + 1)))) {
      throw new UsageError(`never pass the CLI token on the command line: set ${TOKEN_ENV}`);
    }
    throw error;
  }
  const token = env[TOKEN_ENV]?.trim() ?? "";
  if (!TOKEN.test(token)) {
    throw new UsageError(`${TOKEN_ENV} must hold the CLI token created in the browser`);
  }
  return {
    coordinator: new URL(endpointOption(required(values.coordinator, "coordinator"), "coordinator"))
      .origin,
    announcementSha256: sha256Option(
      required(values["announcement-sha256"], "announcement-sha256"),
      "announcement-sha256",
    ),
    token,
    ...(values.work === undefined ? {} : { work: pathOption(values.work) }),
  };
}
