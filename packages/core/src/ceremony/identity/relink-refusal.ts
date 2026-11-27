/**
 * Why a linked GitHub account may not change its wallet now, or null. One wallet per account at
 * any time and across the whole transcript (`verify` checks it): the wallet is fixed once a
 * contribution in the transcript names it, and does not change while the account holds the session
 * in progress (its attestation is signed by the wallet its contributions name).
 */
export interface RelinkStanding {
  contributed: boolean;
  inTurn: boolean;
}

export const relinkRefusal = (standing: RelinkStanding): "already-linked" | "busy" | null =>
  standing.contributed ? "already-linked" : standing.inTurn ? "busy" : null;
