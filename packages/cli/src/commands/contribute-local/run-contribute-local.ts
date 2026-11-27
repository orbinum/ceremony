/**
 * Simulated contributors for a rehearsal (local or testnet only; core refuses their records on
 * mainnet): `options.contributors` sessions, each over every circuit, holding the directory's lock.
 * Each contribution is verified like an upload, and accepted only if the time its record carries
 * (when it was accepted) is still inside the window.
 */
import { rm } from "node:fs/promises";
import {
  checkContributable,
  circuitsOf,
  type ContributionRecord,
  nextSeq,
  SIMULATED_NETWORKS,
} from "@orbinum-ceremony/core";
import { assertPinnedSetup, layout, loadCeremony } from "../../artifacts";
import {
  type ContributionMetrics,
  loadMetrics,
  metricsKey,
  openTranscript,
  saveMetrics,
  withLock,
} from "../../store";
import type { Clock } from "../types";
import { contributeOnce } from "./contribute-once";
import type { ContributeLocalOptions } from "./types";

const describe = (r: ContributionRecord, m: ContributionMetrics) =>
  [
    `seq ${r.seq} ${r.circuit.padEnd(8)} #${r.index} ${r.contribution_hash.slice(0, 16)}…`,
    `${m.bytes} B`,
    `contribute ${m.ms.contribute} ms`,
    `precheck ${m.ms.precheck} ms`,
    `verify ${m.ms.verify} ms`,
    ...(m.ms.verify_from_r1cs === undefined ? [] : [`from r1cs ${m.ms.verify_from_r1cs} ms`]),
  ].join("  ");

const refuse = (problems: string[]) => {
  if (problems.length > 0) throw new Error(problems.join("; "));
};

export async function runContributeLocal(
  options: ContributeLocalOptions,
  clock: Clock = () => new Date(),
): Promise<void> {
  const { announcement, init } = await loadCeremony(options.dir);
  const network = announcement.value.network;
  if (!SIMULATED_NETWORKS.includes(network)) {
    throw new Error(`simulated contributions are for rehearsals; this is a ${network} ceremony`);
  }
  await assertPinnedSetup(options.dir, init.value, options.ptau, { r1cs: options.crossCheckR1cs });

  await withLock(layout(options.dir).lock, async () => {
    const store = await openTranscript(options.dir, announcement);
    const records = () => store.transcript.records;
    const metrics = await loadMetrics(options.dir);
    const first = nextSeq(records());

    for (let seq = first; seq < first + options.contributors; seq++) {
      const step = { options, init: init.value, store, seq, contributor: `local-${seq}` };
      for (const circuit of circuitsOf(init.value)) {
        refuse(checkContributable(records(), announcement.value, clock().getTime()));
        let at: Date | undefined;
        const done = await contributeOnce(step, circuit, () => (at = clock()));
        const late = checkContributable(records(), announcement.value, (at as Date).getTime());
        if (late.length > 0) {
          await Promise.all(done.files.map((f) => rm(f, { force: true })));
          refuse(late);
        }
        await store.append(done.record);
        metrics[metricsKey(circuit, done.record.index)] = done.metrics;
        await saveMetrics(options.dir, metrics);
        console.log(describe(done.record, done.metrics));
      }
    }
  });
}
