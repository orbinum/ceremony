/** Text that may reach a terminal or a report: no private paths, no control bytes. SPEC §7. */
import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { stripControl } from "@orbinum-ceremony/core";

const real = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/** The temp dir first (both spellings on macOS), so it wins over `~` when it lies under home. */
const PRIVATE: readonly (readonly [string, string])[] = [
  [real(tmpdir()), "$TMPDIR"],
  [tmpdir(), "$TMPDIR"],
  [homedir(), "~"],
];

/** A character that continues a path component: a match followed by one is a different path. */
const PATH_CHAR = String.raw`[\w.~-]`;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * `path` up to a component boundary (`/root` never matches `/rootfs`). Whatever precedes it is
 * not checked: a match after other text (a terminal escape, a prefix) is still hidden.
 */
const pathPattern = (path: string) => new RegExp(`${escape(path)}(?!${PATH_CHAR})`, "g");

/**
 * The spellings of `path` text may carry: as given, its realpath, and either one under `~` when
 * it lies under home (text an earlier `redact` already passed through spells it that way).
 */
const spellings = (path: string): string[] => {
  const home = homedir();
  const given = [...new Set([path, real(path)])];
  const underHome = given.filter((p) => home.length > 1 && p.startsWith(`${home}/`));
  return [...given, ...underHome.map((p) => `~${p.slice(home.length)}`)];
};

/**
 * Removes operator-identifying paths (`/Users/<name>/…` → `~/…`, plus any `extra` such as the
 * ceremony directory, under every spelling of `spellings`) and terminal control bytes from text.
 * `extra` is applied first, then the temp dir, then home.
 */
export function redact(text: string, extra: readonly (readonly [string, string])[] = []): string {
  // Longest first: a path that lies under another's spelling (a link inside its own target, as
  // under Linux's /tmp) must be replaced before the shorter one swallows its prefix.
  const extras = extra
    .flatMap(([path, label]) => spellings(path).map((p) => [p, label] as const))
    .toSorted((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [raw, label] of [...extras, ...PRIVATE]) {
    const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
    if (path.length > 1) out = out.replace(pathPattern(path), () => label);
  }
  return stripControl(out);
}

/** The message of any thrown value, redacted. */
export const errorMessage = (error: unknown): string =>
  redact(error instanceof Error ? error.message : String(error));
