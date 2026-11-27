/**
 * `parseArgs` in strict mode, its errors as `UsageError`: one parser for every command, so a bad
 * option is always a usage error (exit 2, with the command's usage) and never a stack trace.
 */
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { UsageError } from "./usage-error";

export function parseOptions<T extends ParseArgsOptionsConfig>(argv: string[], options: T) {
  try {
    return parseArgs({ args: argv, options, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}
