/**
 * Why a mirror's transcript `next` would roll the local one back: it must extend every local record
 * (a sealed beacon included) and keep any local finals.
 */
import { canonicalJson, type Transcript } from "@orbinum-ceremony/core";

export function rollback(local: Transcript, next: Transcript): string[] {
  const problems: string[] = [];
  if (local.records.length > next.records.length) {
    problems.push(`${next.records.length} records, ${local.records.length} here`);
  }
  if (local.records.some((r, i) => next.records[i] && next.records[i].chain !== r.chain)) {
    problems.push("does not extend the local chain");
  }
  if (local.finals.length > 0 && canonicalJson(local.finals) !== canonicalJson(next.finals)) {
    problems.push("drops or changes the local finals");
  }
  return problems;
}
