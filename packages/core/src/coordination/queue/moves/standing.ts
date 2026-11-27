/**
 * An identity's standing in the queue, created on first sight. Own properties only, so no
 * prototype key reads as an identity; a standing stored before `infraResults` and `held` existed
 * gets them filled in.
 */
import type { IdentityStanding, QueueState } from "../types";

export function standing(s: QueueState, githubId: number): IdentityStanding {
  const key = String(githubId);
  if (!Object.hasOwn(s.identities, key)) {
    s.identities[key] = {
      noShows: 0,
      cooldownUntil: 0,
      rejected: 0,
      banned: false,
      infraResults: 0,
      held: false,
      accepted: [],
    };
  }
  const id = s.identities[key] as IdentityStanding;
  id.infraResults ??= 0;
  id.held ??= false;
  return id;
}
