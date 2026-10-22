/**
 * Tampering with a ceremony directory as a hostile mirror or coordinator would, then verifying it.
 */
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Chained,
  chainGenesis,
  nextChain,
  serializeJson,
  type Transcript,
  type TranscriptRecord,
} from "@orbinum-ceremony/core";
import { layout, loadAnnouncement } from "../../src/artifacts";
import { runVerify, type VerifyOptions } from "../../src/commands/verify";
import type { Check } from "../../src/ui";

/** A full copy of a ceremony directory, mutated by `tamper`. */
export async function tamperedCopy(dir: string, tamper: (copy: string) => Promise<void>) {
  const copy = await mkdtemp(join(tmpdir(), "orbinum-tamper-"));
  await cp(dir, copy, { recursive: true });
  await tamper(copy);
  return copy;
}

/** Edits a JSON file in place, written back in the canonical form (as every tool writes it). */
export async function editJson<T>(path: string, edit: (value: T) => void) {
  const value = JSON.parse(await readFile(path, "utf8")) as T;
  edit(value);
  await writeFile(path, serializeJson(value));
}

/**
 * Rewrites the transcript the way a malicious coordinator would: edit the records, then recompute
 * every chain link so the chain itself verifies.
 */
export async function rewriteHistory(dir: string, edit: (records: Chained[]) => Chained[]) {
  const announcement = await loadAnnouncement(dir);
  await editJson<Transcript>(layout(dir).transcript, (t) => {
    let prev = chainGenesis(announcement.value.ceremony_id, announcement.value);
    t.records = edit(t.records).map(({ prev_chain: _p, chain: _c, ...record }) => {
      const chain = nextChain(prev, record as TranscriptRecord);
      const linked = Object.assign(record, { prev_chain: prev, chain }) as Chained;
      prev = chain;
      return linked;
    });
    for (const f of t.finals) f.final_chain = prev;
  });
}

/** Runs verify and returns the failed checks, with their details. */
export async function failures(options: VerifyOptions): Promise<Check[]> {
  return (await runVerify(options)).checks.filter((c) => c.status === "fail");
}

/** Runs verify and returns the ids of the failed checks. */
export const failedChecks = async (options: VerifyOptions): Promise<string[]> =>
  (await failures(options)).map((c) => c.id);
