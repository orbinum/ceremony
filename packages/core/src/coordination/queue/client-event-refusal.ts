/**
 * Why a contributor or the operator (`by`) may not send a queue event directly, or null if they
 * may: uploads, results and finalization enter only through their own checked paths, the
 * operator's events only from the operator and the operator sends nothing else, and only a GitHub
 * identity with a linked wallet may join the queue.
 */
import { OPERATOR_EVENTS } from "./constants";
import type { QueueEvent } from "./types";

export function clientEventRefusal(
  event: QueueEvent,
  linked: boolean,
  by: "contributor" | "operator",
): "invalid-transition" | "not-linked" | null {
  if (event.type === "uploaded" || event.type === "verified" || event.type === "finalize") {
    return "invalid-transition";
  }
  const operatorEvent = (OPERATOR_EVENTS as readonly string[]).includes(event.type);
  if (operatorEvent !== (by === "operator")) return "invalid-transition";
  return event.type === "join" && !linked ? "not-linked" : null;
}
