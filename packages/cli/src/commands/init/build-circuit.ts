/**
 * Builds one circuit's r1cs and genesis into `ctx.out`: compile → match the release → check the
 * shape → genesis zkey (built twice and compared when `checkDeterminism`). Returns its init.json
 * entry; its ceremony version is the release's active version + 1.
 */
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CEREMONY_LAYOUT,
  ceremonyVersionOf,
  type CircuitName,
  checkGenesis,
  checkR1csShape,
  checkRelease,
  createSha256,
  type InitCircuit,
  initCircuitOf,
  readMpcParams,
  readR1csHeader,
  TOOLING,
} from "@orbinum-ceremony/core";
import { ensureDir, hashFile, readBytes } from "../../io";
import { compileCircuit } from "../../source";
import { newGenesisZkey } from "../../tools";
import type { BuildContext } from "./types";

async function genesis(r1cs: string, ptau: string, zkey: string) {
  await newGenesisZkey(r1cs, ptau, zkey);
  const params = readMpcParams(await readBytes(zkey));
  const problems = checkGenesis(params);
  if (problems.length > 0) throw new Error(`genesis: ${problems.join("; ")}`);
  return { sha256: await hashFile(zkey, createSha256()), csHash: params.csHash };
}

export async function buildCircuit(
  name: CircuitName,
  circuitId: number,
  ctx: BuildContext,
): Promise<InitCircuit> {
  const build = join(ctx.work, "build", name);
  const published = ctx.release.published(name);
  const ceremonyVersion = ceremonyVersionOf(published);
  const compiled = await compileCircuit(ctx.source, name, build, TOOLING.circomFlags);
  const release = checkRelease(published, {
    r1cs_sha256: compiled.sha256,
    ceremony_version: ceremonyVersion,
  });
  if (release.length > 0) throw new Error(`${name}: ${release.join("; ")}`);
  const header = readR1csHeader(await readBytes(compiled.path));
  const shape = checkR1csShape(header);
  if (shape.length > 0) throw new Error(`${name}: ${shape.join("; ")}`);

  const r1cs = join(ctx.out, CEREMONY_LAYOUT.r1cs(name));
  const zkey = join(ctx.out, CEREMONY_LAYOUT.zkey(name, 0));
  await ensureDir(join(ctx.out, "r1cs"));
  await ensureDir(join(ctx.out, "genesis"));
  await copyFile(compiled.path, r1cs);
  const first = await genesis(r1cs, ctx.ptau, zkey);
  if (ctx.checkDeterminism) {
    const second = await genesis(r1cs, ctx.ptau, join(build, `${name}.genesis.again.zkey`));
    if (second.sha256 !== first.sha256 || second.csHash !== first.csHash) {
      throw new Error(`${name}: groth16 setup is not deterministic (A1/A3)`);
    }
  }

  return initCircuitOf(name, { circuitId, ceremonyVersion }, header, {
    r1csSha256: compiled.sha256,
    genesisSha256: first.sha256,
    csHash: first.csHash,
  });
}
