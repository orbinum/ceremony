/**
 * Frozen inputs: ptau, circuit set, r1cs (vs init, release, source) and genesis. SPEC §1, §2.1–2.3.
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
import {
  type CircuitRelease,
  compileCircuit,
  type ExportedSource,
  exportSource,
  repoId,
  resolveRelease,
} from "../../../source";
import { circomVersion, newGenesisZkey, originUrl } from "../../../tools";
import {
  attemptGated,
  markFailed,
  PTAU_PREREQUISITE,
  stagedPtau,
  type VerifyContext,
  workDir,
} from "../context";
import { staged } from "../staging";

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

const ORIGIN_ID = "circuits clone's origin is the announced repo";

/**
 * Resolves the announced tag in the verifier's own clone, which must be a clone of the announced
 * repository; the tag must be the announced commit.
 */
async function resolveAnnouncedRelease(ctx: VerifyContext): Promise<CircuitRelease | undefined> {
  const { report, options, announcement } = ctx;
  const id = "announced tag resolves to the announced commit";
  const src = announcement.value.circuits_source;
  const repo = options.circuitsRepo;
  if (!repo) {
    report.skip(ORIGIN_ID, "needs --circuits-repo", true);
    report.skip(id, "needs --circuits-repo", true);
    return undefined;
  }
  const clone = repo;
  await report.attempt(ORIGIN_ID, async () => {
    const origin = repoId(await originUrl(clone));
    return origin === repoId(src.repo) ? [] : [`origin is ${origin}`];
  });
  try {
    const r = await resolveRelease(clone, src.tag, src.commit);
    report.pass(id, `${src.tag} @ ${r.commit.slice(0, 12)}`);
    return r;
  } catch (error) {
    report.fail(id, (error as Error).message);
    return undefined;
  }
}

/** The release source, exported, with the circomlib init.json recorded. */
async function exportRelease(ctx: VerifyContext, rel: CircuitRelease) {
  const { report, init } = ctx;
  let source: ExportedSource | undefined;
  await report.attempt(`local circom is ${init.value.tooling.circom} (as at init)`, async () =>
    (await circomVersion()) === init.value.tooling.circom ? [] : ["different circom version"],
  );
  await report.attempt(
    "release source exported, with the circomlib init.json recorded",
    async () => {
      await ensureDir(workDir(ctx));
      const s = await exportSource(rel, workDir(ctx));
      if (s.circomlib !== init.value.tooling.circomlib) {
        return [`circomlib ${s.circomlib}, init.json recorded ${init.value.tooling.circomlib}`];
      }
      source = s;
      return [];
    },
  );
  return source;
}

/** Every input check; failures of the cheap ones gate the expensive ones per circuit. */
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
    /* oxlint-disable no-await-in-loop -- per-circuit checks run in order; compiling and groth16
       setup are memory-heavy */
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
    /* oxlint-enable no-await-in-loop */
  }
}
