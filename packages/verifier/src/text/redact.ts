/**
 * Removes operator-identifying paths (`/Users/<name>/…` → `~/…`, plus any `extra` such as the
 * ceremony directory) and terminal control bytes from text that may reach a terminal or a report.
 * Each `extra` path is matched as given, as its realpath, and either one under `~` (how text an
 * earlier `redact` passed through spells it). `extra` goes first, longest spelling first, so a
 * path under another's spelling (a link inside its own target, as under Linux's /tmp) is replaced
 * before the shorter one swallows its prefix; then the temp dir (both spellings on macOS, so it
 * wins over `~` when it lies under home), then home. A match ends at a path-component boundary
 * (`/root` never matches `/rootfs`), whatever precedes it.
 */
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

const PRIVATE: readonly (readonly [string, string])[] = [
  [real(tmpdir()), "$TMPDIR"],
  [tmpdir(), "$TMPDIR"],
  [homedir(), "~"],
];

const PATH_CHAR = String.raw`[\w.~-]`;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const pathPattern = (path: string) => new RegExp(`${escape(path)}(?!${PATH_CHAR})`, "g");

const spellings = (path: string): string[] => {
  const home = homedir();
  const given = [...new Set([path, real(path)])];
  const underHome = given.filter((p) => home.length > 1 && p.startsWith(`${home}/`));
  return [...given, ...underHome.map((p) => `~${p.slice(home.length)}`)];
};

export function redact(text: string, extra: readonly (readonly [string, string])[] = []): string {
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
