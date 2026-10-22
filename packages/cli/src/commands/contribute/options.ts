/** `contribute` options. */
import type { ClientInfo } from "@orbinum-ceremony/core";
import {
  endpointOption,
  parseOptions,
  pathOption,
  required,
  sha256Option,
  UsageError,
} from "../../args";

/** Where the token comes from: never argv, which other users and the shell history can read. */
export const TOKEN_ENV = "ORBINUM_CEREMONY_TOKEN";

/** A contributor's session from the command line (SPEC §4.4). */
export interface ContributeOptions {
  /** The coordinator's origin. */
  coordinator: string;
  /** The officially announced SHA-256 of `ceremony.json`: what the heads are checked against. */
  announcementSha256: string;
  /** The CLI token minted in the browser. */
  token: string;
  /** Where to keep the session's files and its summary; a fresh private directory by default. */
  work?: string;
  /** The client the records name; by default this checkout's version and commit. */
  client?: ClientInfo;
}

/** Usage text, printed by `--help` and on a usage error. */
export const CONTRIBUTE_USAGE = `orbinum-ceremony contribute --coordinator <https url> --announcement-sha256 <hex>
    Contributes to every circuit of the ceremony from this machine (SPEC §4.4). First, in the
    browser: sign in with GitHub, link your wallet, join the queue and create a CLI token; then
    run this with the token in ${TOKEN_ENV} and the SHA-256 of ceremony.json from an official
    channel. It waits for your turn, claims it, keeps it alive, contributes to each circuit (fresh
    randomness drawn inside a snarkjs child process that exits after each one), checks every
    contribution itself before uploading it, and ends the session (also on Ctrl-C). Afterwards,
    sign the attestation in the browser with the hashes it prints.
    [--work <dir>]          keep the session's files and summary there (default: a new private
                            directory, removed at the end)`;

/** A CLI token's shape: a base64url body and a hex MAC. Its content is the coordinator's. */
const TOKEN = /^[A-Za-z0-9_-]{1,1024}\.[0-9a-f]{64}$/;

/** Parses argv and the environment; a bad option is a `UsageError` (the token is never shown). */
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
    // The parser quotes what it refused: never a token pasted on the command line.
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
