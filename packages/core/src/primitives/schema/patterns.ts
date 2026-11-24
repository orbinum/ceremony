/** Text patterns shared across documents read from outside; a pattern with one use stays local. */

/** Ceremony ids: lowercase, digits and hyphens (they become path segments and EIP-712 salts). */
export const CEREMONY_ID = /^[a-z0-9-]{1,64}$/;

/** A circuit name: it becomes a file name and a route segment. */
export const CIRCUIT_NAME = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * A well-formed circuit name that is not an `Object.prototype` key (`constructor`): circuit names
 * index plain objects.
 */
export const isCircuitName = (v: string): boolean =>
  CIRCUIT_NAME.test(v) && !(v in Object.prototype);

/** GitHub logins: alphanumerics and single inner hyphens, at most 39 characters. */
export const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** Printable ASCII, possibly empty: no control characters reach logs or records. */
export const PRINTABLE = /^[\x20-\x7e]*$/;

/** Printable ASCII, at least one character. */
export const NONEMPTY_PRINTABLE = /^[\x20-\x7e]+$/;

/** An MPC contributor name, as the zkey stores it (outside h_k, so it must be unambiguous). */
export const ZKEY_NAME = /^[\x20-\x7e]{1,64}$/;

/** A token without spaces that cannot be read as a command-line option (refs, tags, URLs). */
export const TOKEN = /^[\x21-\x2c\x2e-\x7e][\x21-\x7e]*$/;

/** A full git commit id: refuses ref names and revision expressions. */
export const COMMIT = /^[0-9a-f]{40}$/;

/** A client build commit: abbreviated or full. */
export const SHORT_COMMIT = /^[0-9a-f]{7,40}$/;

/** A tool version (`0.7.6`, `2.2.3+build`). */
export const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;

/** Text a verifier log may contain: printable ASCII, tabs and newlines. */
export const LOG_TEXT = /^[\t\n\x20-\x7e]*$/;

/** A log made publishable: printable ASCII, tabs and newlines, bounded. */
export const toLogText = (text: string, max: number): string =>
  text.replace(/[^\t\n\x20-\x7e]/g, "?").slice(0, max);

/** Free text from outside made printable and bounded, for logs and error details. */
export const toPrintable = (text: string, max: number): string =>
  text.replace(/[^\x20-\x7e]/g, "?").slice(0, max);
