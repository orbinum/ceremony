/**
 * The join the queue applies for a GitHub id: invited as the announcement says, never as a caller
 * says; null when a closed ceremony does not invite the account.
 */
import { type CeremonyAnnouncement, isClosed, isInvited } from "../../ceremony";

export function admittedJoin(
  a: CeremonyAnnouncement,
  githubId: number,
): { type: "join"; githubId: number; invited: boolean } | null {
  const invited = isInvited(a, githubId);
  return !invited && isClosed(a) ? null : { type: "join", githubId, invited };
}
