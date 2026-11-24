/**
 * The announced circuits release in the verifier's own clone: its origin must be the announced
 * repository, the announced tag the announced commit, and its exported source the circomlib
 * `init.json` recorded. SPEC §2.1.
 */
import { circomVersion, originUrl } from "../../../tools";
import { ensureDir } from "../../../io";
import {
  type CircuitRelease,
  type ExportedSource,
  exportSource,
  repoId,
  resolveRelease,
} from "../../../source";
import { type VerifyContext, workDir } from "../context";

const ORIGIN_ID = "circuits clone's origin is the announced repo";

/**
 * Resolves the announced tag in the verifier's own clone, which must be a clone of the announced
 * repository; the tag must be the announced commit.
 */
export async function resolveAnnouncedRelease(
  ctx: VerifyContext,
): Promise<CircuitRelease | undefined> {
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
export async function exportRelease(ctx: VerifyContext, rel: CircuitRelease) {
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
