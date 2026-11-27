/**
 * What every command is to the entry point (a one-line summary, its usage text, and how to run it
 * from argv), and the injectable clock tests use to replay a ceremony at the times its announcement
 * fixed. Kept beside the command directories: each imports these types, so the registry (which
 * imports every command) cannot host them.
 */

export interface Command {
  summary: string;
  usage: string;
  run(argv: string[]): Promise<void>;
}

export type Clock = () => Date;
