/**
 * Every check of the frozen inputs: the ptau, the circuit set, each r1cs (against init.json, the
 * release and its rebuilt source) and each genesis. Failures of the cheap ones gate the expensive
 * ones per circuit.
 */
import { join } from "node:path";
import {
  checkInitAgainstConfig,
  checkR1csShape,
  checkRelease,
  createSha256,
  type InitCircuit,
  readMpcParams,
  readR1csHeader,
  TOOLING,
} from "@orbinum-ceremony/core";
import { assertPinnedPtau, ensureDir, hashFile, readBytes } from "../../../io";
import { compileCircuit } from "../../../source";
import { newGenesisZkey } from "../../../tools";
import { attemptGated, markFailed, staged, stagedPtau, workDir } from "../context";
import { PTAU_PREREQUISITE } from "../gate";
import type { VerifyContext } from "../types";
import { exportRelease } from "./export-release";
import { resolveAnnouncedRelease } from "./resolve-announced-release";

async function r1csMatches(ctx: VerifyContext, c: InitCircuit): Promise<string[]> {
  const path = staged(ctx.files.r1cs, c.name, "r1cs");
  if ((await hashFile(path, createSha256())) !== c.r1cs_sha256) {
    return ["SHA-256 differs from init.json"];
  }
  return checkR1csShape(readR1csHeader(await readBytes(path)), c);
}

async function genesisMatches(ctx: VerifyContext, c: InitCircuit): Promise<string[]> {
  const path = staged(ctx.files.genesis, c.name, "genesis");
  const problems: string[] = [];
  if ((await hashFile(path, createSha256())) !== c.genesis_sha256) problems.push("SHA-256 differs");
  if (readMpcParams(await readBytes(path)).csHash !== c.cs_hash) problems.push("csHash differs");
  return problems;
}

async function genesisRebuilds(ctx: VerifyContext, c: InitCircuit) {
  const out = join(workDir(ctx), `${c.name}.rebuilt.zkey`);
  await ensureDir(workDir(ctx));
  const r1cs = staged(ctx.files.r1cs, c.name, "r1cs");
  await newGenesisZkey(r1cs, stagedPtau(ctx), out, ctx.options.snarkjsLimits);
  const same = (await hashFile(out, createSha256())) === c.genesis_sha256;
  return same ? [] : ["rebuilt genesis differs"];
}

export async function checkInputs(ctx: VerifyContext): Promise<void> {
  const { report, init, options } = ctx;
  const ptauOk = await report.attempt("ptau matches the pinned BLAKE2b-512", async () => {
    await assertPinnedPtau(stagedPtau(ctx));
  });
  if (!ptauOk) markFailed(ctx, PTAU_PREREQUISITE, "ptau matches the pinned BLAKE2b-512");

  report.expect(
    "init.json pins the ptau and the tooling, and every circuit fits the ptau",
    checkInitAgainstConfig(init.value),
  );

  const rel = await resolveAnnouncedRelease(ctx);
  const source = rel ? await exportRelease(ctx, rel) : undefined;

  for (const c of init.value.circuits) {
    const r1csId = `${c.name}: r1cs matches init.json (hash and shape)`;
    if (!(await report.attempt(r1csId, () => r1csMatches(ctx, c)))) markFailed(ctx, c.name, r1csId);

    const releaseId = `${c.name}: r1cs is the one the release published, at the next version`;
    if (rel) await report.attempt(releaseId, async () => checkRelease(rel.published(c.name), c));
    else report.skip(releaseId, "needs --circuits-repo", true);

    const rebuildId = `${c.name}: r1cs rebuilt from the release is identical`;
    if (source) {
      const s = source;
      await report.attempt(rebuildId, async () => {
        const out = join(workDir(ctx), "build", c.name);
        const built = await compileCircuit(s, c.name, out, TOOLING.circomFlags);
        return built.sha256 === c.r1cs_sha256 ? [] : ["rebuilt r1cs differs"];
      });
    } else {
      report.skip(rebuildId, "needs --circuits-repo", true);
    }

    const genesisId = `${c.name}: genesis matches init.json (SHA-256, csHash)`;
    if (!(await report.attempt(genesisId, () => genesisMatches(ctx, c)))) {
      markFailed(ctx, c.name, genesisId);
    }
    const rebuiltId = `${c.name}: genesis rebuilt from r1cs + ptau is identical`;
    if (options.rebuildGenesis) {
      await attemptGated(ctx, c.name, rebuiltId, () => genesisRebuilds(ctx, c));
    } else {
      report.skip(rebuiltId, "pass --rebuild-genesis");
    }
  }
}
