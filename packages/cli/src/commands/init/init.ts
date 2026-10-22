/**
 * `init`: pins the ptau, compiles the circuits from the audited release and builds the genesis
 * zkeys, then writes `genesis/init.json`. Everything is built in a staging directory and swapped in
 * at the end, so a failed run never leaves an init.json next to genesis files of another build.
 * SPEC §2.1–2.3.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildInit,
  CEREMONY_LAYOUT,
  CIRCUIT_ORDER,
  type InitCircuit,
  type InitRecord,
  PTAU,
  TOOLING,
} from "@orbinum-ceremony/core";
import { layout } from "../../artifacts";
import { writeJson } from "../../io";
import { exportSource, resolveRelease } from "../../source";
import { hasContributions, withLock } from "../../store";
import { circomVersion } from "../../tools";
import type { Command } from "../types";
import { buildCircuit } from "./build-circuit";
import { INIT_USAGE, type InitOptions, parseInitOptions } from "./options";
import { obtainPtau } from "./ptau";

/**
 * A directory that already holds a ceremony may only be rebuilt before anything builds on it:
 * never under a transcript or contributions (even with its init.json gone), never once announced,
 * and only with `--force`.
 */
async function assertRebuildable(options: InitOptions): Promise<void> {
  const paths = layout(options.out);
  if (existsSync(paths.transcript) || (await hasContributions(options.out, CIRCUIT_ORDER))) {
    throw new Error(`${options.out} already has contributions: it cannot be rebuilt`);
  }
  if (existsSync(paths.announcement)) {
    throw new Error(
      `${options.out} is announced: ceremony.json pins its init.json (remove it only if never published)`,
    );
  }
  if (existsSync(paths.init) && !options.force) {
    throw new Error(`${options.out} already holds a ceremony; pass --force to rebuild it`);
  }
}

/** Builds the ceremony directory, holding its lock; returns the init record written. */
export async function runInit(options: InitOptions): Promise<InitRecord> {
  return withLock(layout(options.out).lock, () => init(options));
}

async function init(options: InitOptions): Promise<InitRecord> {
  await assertRebuildable(options);
  const circom = await circomVersion();
  if (circom !== TOOLING.circom) throw new Error(`circom ${circom}, pinned ${TOOLING.circom}`);

  const work = await mkdtemp(join(tmpdir(), "orbinum-ceremony-init-"));
  const staging = join(options.out, ".init.tmp");
  await rm(staging, { recursive: true, force: true });
  try {
    console.log(`ptau: ${PTAU.file}`);
    const ptau = await obtainPtau(options.out, options.ptau);
    console.log("  BLAKE2b-512 matches the pin");

    console.log(`source: ${options.circuitsRef}`);
    const release = await resolveRelease(options.circuitsRepo, options.circuitsRef);
    const source = await exportSource(release, work);
    console.log(`  commit ${release.commit}, circomlib ${source.circomlib}`);

    const circuits: InitCircuit[] = [];
    for (const name of CIRCUIT_ORDER) {
      console.log(`${name}: compile, check, genesis`);
      // oxlint-disable-next-line no-await-in-loop -- sequential: groth16 setup is memory-heavy
      const c = await buildCircuit(name, {
        release,
        source,
        ptau,
        out: staging,
        work,
        checkDeterminism: options.checkDeterminism,
      });
      console.log(`  r1cs ${c.r1cs_sha256.slice(0, 16)}… csHash ${c.cs_hash.slice(0, 16)}…`);
      circuits.push(c);
    }

    const record = buildInit({
      ceremonyId: options.ceremonyId,
      createdAt: new Date().toISOString(),
      circom,
      circomlib: source.circomlib,
      circomFlags: TOOLING.circomFlags,
      source: { ref: options.circuitsRef, commit: release.commit },
      circuits,
    });
    // init.json lives in genesis/: the genesis zkeys and the record that pins them move together.
    await writeJson(join(staging, CEREMONY_LAYOUT.init), record);
    for (const dir of ["r1cs", "genesis"]) {
      // oxlint-disable-next-line no-await-in-loop -- two renames, in order
      await rm(join(options.out, dir), { recursive: true, force: true });
      // oxlint-disable-next-line no-await-in-loop -- two renames, in order
      await rename(join(staging, dir), join(options.out, dir));
    }
    const path = layout(options.out).init;
    console.log(`wrote ${path}`);
    return record;
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
  }
}

/** `init` as the entry point runs it. */
export const initCommand: Command = {
  summary: "Pin the ptau, compile the circuits from a release tag and create the genesis zkeys",
  usage: INIT_USAGE,
  run: async (argv) => {
    await runInit(parseInitOptions(argv));
  },
};
