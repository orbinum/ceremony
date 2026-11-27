/** `GET /api/queue/me`, retried and validated: the phase, one's place in line, or one's slot. */
import {
  asArray,
  asCircuitName,
  asObject,
  asOneOf,
  asSafeInt,
  CEREMONY_STATES,
  CONTRIBUTOR_PATHS,
  MAX_CIRCUITS,
} from "@orbinum-ceremony/core";
import { type Contributor, contributorCall } from "../../../io";
import { retrying } from "../retry";
import { SLOT_STATUSES } from "./constants";
import type { SlotView } from "./types";

export async function placeOf(who: Contributor, signal?: AbortSignal): Promise<SlotView> {
  const v = await retrying(
    () => contributorCall(who, "GET", CONTRIBUTOR_PATHS.me, { signal }),
    signal,
  );
  const slot = v.slot === null ? null : asObject(v.slot, "me.slot");
  return {
    phase: asOneOf(v.phase, "me.phase", CEREMONY_STATES),
    position: v.position === null ? null : asSafeInt(v.position, "me.position", 1, 2 ** 32),
    slot: slot && {
      seq: asSafeInt(slot.seq, "me.slot.seq", 1, 2 ** 32),
      claimed: slot.claimed === true,
      circuits: asArray(slot.circuits, "me.slot.circuits", MAX_CIRCUITS).map((c, i) => {
        const o = asObject(c, `me.slot.circuits[${i}]`);
        return {
          circuit: asCircuitName(o.circuit, `me.slot.circuits[${i}].circuit`),
          status: asOneOf(o.status, `me.slot.circuits[${i}].status`, SLOT_STATUSES),
        };
      }),
    },
  };
}
