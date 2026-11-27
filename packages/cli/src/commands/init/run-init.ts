/**
 * Builds the ceremony directory holding its lock: pins the ptau, compiles the circuits from the
 * audited release and builds the genesis zkeys, then writes `genesis/init.json`; returns the init
 * record. Everything is built in a staging directory and swapped in at the end, so a failed run
 * never leaves an init.json next to genesis files of another build (init.json lives in `genesis/`,
 * so the genesis zkeys and the record that pins them move together). A directory that already
 * holds a ceremony may only be rebuilt before anything builds on it: never under a transcript or
 * contributions (even with its init.json gone), never once announced, and only with `--force`.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildInit, CEREMONY_LAYOUT, type InitRecord, PTAU, TOOLING } from "@orbinum-ceremony/core";
import { layout } from "../../artifacts";
import { writeJson } from "../../io";
import { exportSource, resolveRelease } from "../../source";
import { hasContributions, withLock } from "../../store";
import { circomVersion } from "../../tools";
import { buildCircuits } from "./build-circuits";
import { obtainPtau } from "./obtain-ptau";
import type { InitOptions } from "./types";

async function assertRebuildable(options: InitOptions): Promise<void> {
  const paths = layout(options.out);
  if (existsSync(paths.transcript) || (await hasContributions(options.out))) {
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

    const circuits = await buildCircuits(
      options.circuits,
      { release, source, ptau, out: staging, work, checkDeterminism: options.checkDeterminism },
      options.beyondMeasuredBounds,
    );

    const record = buildInit({
      ceremonyId: options.ceremonyId,
      createdAt: new Date().toISOString(),
      circom,
      circomlib: source.circomlib,
      circomFlags: TOOLING.circomFlags,
      source: { ref: options.circuitsRef, commit: release.commit },
      circuits,
    });
    await writeJson(join(staging, CEREMONY_LAYOUT.init), record);
    for (const dir of ["r1cs", "genesis"]) {
      await rm(join(options.out, dir), { recursive: true, force: true });
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
