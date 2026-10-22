/**
 * `finalize`: preflight → seal the announced beacon → per circuit, the final key → swap `final/`
 * in and record the finals. Nothing irreversible happens before every precondition holds, and a
 * run that fails before the swap leaves the previous `final/` (if any) untouched; a re-run after a
 * failed swap rebuilds the same bytes (the beacon is deterministic). SPEC §2.6.
 */
import { rename, rm } from "node:fs/promises";
import type { FinalRecord } from "@orbinum-ceremony/core";
import { assertPinnedSetup, layout, loadCeremony } from "../../artifacts";
import { ensureDir } from "../../io";
import { openTranscript, withLock } from "../../store";
import type { Clock, Command } from "../types";
import { sealBeacon } from "./beacon";
import { finalizeCircuit } from "./final-key";
import { FINALIZE_USAGE, type FinalizeOptions, parseFinalizeOptions } from "./options";
import { preflight } from "./preflight";

/**
 * Finalizes the ceremony holding its lock: preflight, seal, final keys, swap; returns the finals.
 */
export async function runFinalize(
  options: FinalizeOptions,
  clock: Clock = () => new Date(),
): Promise<FinalRecord[]> {
  const { announcement, init } = await loadCeremony(options.dir);
  const paths = layout(options.dir);
  await assertPinnedSetup(options.dir, init.value, options.ptau);

  return withLock(paths.lock, async () => {
    const store = await openTranscript(options.dir, announcement, init.value);
    const plans = await preflight(
      options.dir,
      init.value,
      announcement.value,
      announcement.sha256,
      store,
      clock(),
      options.vkPacker,
    );
    const beacon = await sealBeacon(store, announcement.value, clock());
    console.log(`beacon sealed: drand round ${beacon.round} (${beacon.relays.join(", ")})`);

    const out = `${paths.final}.tmp`;
    await rm(out, { recursive: true, force: true });
    await ensureDir(out);
    try {
      const finals: FinalRecord[] = [];
      for (const plan of plans) {
        // oxlint-disable-next-line no-await-in-loop -- sequential: verification is memory-heavy
        const f = await finalizeCircuit(
          {
            dir: options.dir,
            out,
            ptau: options.ptau,
            init: init.value,
            store,
            beacon,
            announcement: announcement.value,
            ...(options.vkPacker ? { vkPacker: options.vkPacker } : {}),
          },
          plan,
        );
        console.log(
          `${plan.circuit.padEnd(8)} ${f.contributions} contributions  final ${f.final_zkey_sha256.slice(0, 16)}…  vk_hash ${f.vk_hash ?? "—"}`,
        );
        finals.push(f);
      }
      await rm(paths.final, { recursive: true, force: true });
      await rename(out, paths.final);
      store.transcript.finals = finals;
      await store.save();
      console.log(`wrote ${paths.transcript}`);
      return finals;
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
}

/** `finalize` as the entry point runs it. */
export const finalizeCommand: Command = {
  summary:
    "Seal the announced drand beacon, apply it, verify from r1cs, export the VKs (SPEC §2.6)",
  usage: FINALIZE_USAGE,
  run: async (argv) => {
    await runFinalize(parseFinalizeOptions(argv));
  },
};
