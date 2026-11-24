/**
 * The circuits for `init`, one after another: compile → match the release → check the shape →
 * genesis zkey, within the bounds the session and verifier were measured for. SPEC §2.1–2.3.
 */
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CEREMONY_LAYOUT,
  ceremonyVersionOf,
  type CircuitName,
  checkGenesis,
  checkMeasuredBounds,
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
import { type CircuitRelease, compileCircuit, type ExportedSource } from "../../source";
import { newGenesisZkey } from "../../tools";

/** Where and how to build. */
export interface BuildContext {
  release: CircuitRelease;
  source: ExportedSource;
  ptau: string;
  /** The staging ceremony directory: `r1cs/` and `genesis/` are written here. */
  out: string;
  work: string;
  checkDeterminism: boolean;
}

async function genesis(r1cs: string, ptau: string, zkey: string) {
  await newGenesisZkey(r1cs, ptau, zkey);
  const params = readMpcParams(await readBytes(zkey));
  const problems = checkGenesis(params);
  if (problems.length > 0) throw new Error(`genesis: ${problems.join("; ")}`);
  return { sha256: await hashFile(zkey, createSha256()), csHash: params.csHash };
}

/**
 * Builds one circuit's r1cs and genesis into `ctx.out`; returns its init.json entry. Its ceremony
 * version is the release's active version + 1.
 */
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

/**
 * Builds every circuit in order; returns their init.json entries. A set past the measured bounds
 * stops before more genesis builds, unless `beyondMeasuredBounds` says they were re-measured.
 */
export async function buildCircuits(
  circuits: readonly { name: CircuitName; circuitId: number }[],
  ctx: BuildContext,
  beyondMeasuredBounds: boolean,
): Promise<InitCircuit[]> {
  const built: InitCircuit[] = [];
  for (const { name, circuitId } of circuits) {
    console.log(`${name} (id ${circuitId}): compile, check, genesis`);
    const c = await buildCircuit(name, circuitId, ctx);
    console.log(
      `  v${c.ceremony_version}, ${c.constraints} constraints, r1cs ${c.r1cs_sha256.slice(0, 16)}… csHash ${c.cs_hash.slice(0, 16)}…`,
    );
    built.push(c);
    const beyond = checkMeasuredBounds(built);
    if (beyond.length > 0 && !beyondMeasuredBounds) {
      throw new Error(
        `${beyond.join("; ")}: re-measure the active cap, the snarkjs bounds and the container, raise them, then pass --beyond-measured-bounds`,
      );
    }
  }
  return built;
}
