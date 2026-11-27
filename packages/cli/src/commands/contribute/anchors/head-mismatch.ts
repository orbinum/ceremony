/**
 * Why a head whose MPC entries are `entries` is not the one the transcript `recorded` ends with
 * (the same contributions, hash and name, in order), or null.
 */
import type { MpcParams } from "@orbinum-ceremony/core";
import type { Recorded } from "./types";

export function headMismatch(
  entries: readonly Pick<MpcParams["entries"][number], "hash" | "name">[],
  recorded: readonly Pick<Recorded, "hash" | "name">[],
): string | null {
  const forked = recorded.findIndex(
    (r, i) =>
      i < entries.length && (entries[i]?.hash !== r.hash || (entries[i]?.name ?? "") !== r.name),
  );
  if (forked !== -1) return `forks from the published transcript at #${forked + 1}`;
  if (entries.length < recorded.length) {
    return `is stale: ${entries.length} contributions, the published transcript records ${recorded.length}`;
  }
  if (entries.length > recorded.length) {
    return `has ${entries.length} contributions, the published transcript records only ${recorded.length}`;
  }
  return null;
}
