/**
 * Agreement among drand relays: each raw answer is verified (BLS) and grouped by value, and the
 * largest group must reach `MIN_RELAYS`, so one bad relay can neither change the value nor block
 * finalization. A relay that failed simply has no answer.
 */
import { MIN_RELAYS } from "../../config";
import type { DrandRound } from "./types";
import { verifyDrandRound } from "./verify-drand-round";

interface RelayAnswer {
  relay: string;
  body: unknown;
}

const lowerHex = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");

export function relayQuorum(
  round: number,
  answers: readonly RelayAnswer[],
): { ok: true; value: DrandRound; relays: string[] } | { ok: false; reason: string } {
  const groups = new Map<string, { value: DrandRound; relays: string[] }>();
  for (const { relay, body } of answers) {
    const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const value = {
      round: b.round as number,
      randomness: lowerHex(b.randomness),
      signature: lowerHex(b.signature),
    };
    if (value.round !== round || !verifyDrandRound(value)) continue;
    const group = groups.get(value.signature) ?? { value, relays: [] };
    if (!group.relays.includes(relay)) group.relays.push(relay);
    groups.set(value.signature, group);
  }
  const best = [...groups.values()].toSorted((x, y) => y.relays.length - x.relays.length)[0];
  if (!best || best.relays.length < MIN_RELAYS) {
    return { ok: false, reason: `fewer than ${MIN_RELAYS} relays agree on a valid round ${round}` };
  }
  return { ok: true, ...best };
}
