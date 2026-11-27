/** The chain value after the last record, or the genesis when there is none. */
import type { Chained } from "./types";

export const headChain = (records: readonly Chained[], genesis: string): string =>
  records.at(-1)?.chain ?? genesis;
