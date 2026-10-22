/**
 * What every command is to the entry point. Kept beside the command directories: each imports
 * these types, so `commands/index.ts` (which imports every command) cannot host them.
 */

/** A command: a one-line summary, its usage text, and how to run it from argv. */
export interface Command {
  summary: string;
  usage: string;
  run(argv: string[]): Promise<void>;
}

/** Injectable clock: tests replay a ceremony at the times its announcement fixed. */
export type Clock = () => Date;
