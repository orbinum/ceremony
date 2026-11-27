/**
 * Text patterns shared across documents read from outside; a pattern with one use stays local.
 * - `CEREMONY_ID`: lowercase, digits and hyphens, since ids become path segments and EIP-712 salts.
 * - `CIRCUIT_NAME`: names become file names and route segments.
 * - `GITHUB_LOGIN`: alphanumerics and single inner hyphens, at most 39 characters.
 * - `PRINTABLE` / `NONEMPTY_PRINTABLE`: printable ASCII, so no control character reaches logs or
 *   records.
 * - `ZKEY_NAME`: an MPC contributor name as the zkey stores it; it lies outside h_k, so it must be
 *   unambiguous.
 * - `TOKEN`: no spaces, and cannot be read as a command-line option (refs, tags, URLs).
 * - `COMMIT`: a full git commit id, refusing ref names and revision expressions; `SHORT_COMMIT`
 *   also accepts an abbreviated client build commit.
 * - `VERSION`: a tool version (`0.7.6`, `2.2.3+build`).
 * - `LOG_TEXT`: what a verifier log may contain: printable ASCII, tabs and newlines.
 */
export const CEREMONY_ID = /^[a-z0-9-]{1,64}$/;

export const CIRCUIT_NAME = /^[a-z][a-z0-9_]{0,31}$/;

export const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export const PRINTABLE = /^[\x20-\x7e]*$/;

export const NONEMPTY_PRINTABLE = /^[\x20-\x7e]+$/;

export const ZKEY_NAME = /^[\x20-\x7e]{1,64}$/;

export const TOKEN = /^[\x21-\x2c\x2e-\x7e][\x21-\x7e]*$/;

export const COMMIT = /^[0-9a-f]{40}$/;

export const SHORT_COMMIT = /^[0-9a-f]{7,40}$/;

export const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;

export const LOG_TEXT = /^[\t\n\x20-\x7e]*$/;
