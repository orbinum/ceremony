/**
 * The circomlib version the audited release's `pnpm-lock.yaml` locks; throws if the lock does not
 * name one. The pattern allows only horizontal whitespace between its anchors, so no two
 * quantifiers overlap and it never backtracks.
 */
import { asString, VERSION } from "../../primitives/schema";

const LOCKED_CIRCOMLIB =
  /\n[ \t]+circomlib:[ \t]*\n[ \t]+specifier:[^\n]*\n[ \t]+version:[ \t]*([^\s(]+)/;

export function lockedCircomlibOf(lock: string): string {
  const version = LOCKED_CIRCOMLIB.exec(lock)?.[1];
  return asString(version, "pnpm-lock.yaml circomlib version", 32, VERSION);
}
