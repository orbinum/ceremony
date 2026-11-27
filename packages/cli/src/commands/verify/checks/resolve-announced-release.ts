/**
 * Resolves the announced circuits tag in the verifier's own clone, which must be a clone of the
 * announced repository (its origin), and the tag must be the announced commit.
 */
import { type CircuitRelease, repoId, resolveRelease } from "../../../source";
import { originUrl } from "../../../tools";
import type { VerifyContext } from "../types";

const ORIGIN_ID = "circuits clone's origin is the announced repo";

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
