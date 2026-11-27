/**
 * Why a contributor or operator may not send a queue event directly, or null if they may: uploads,
 * results and finalization enter only through their own checked paths, and only a GitHub identity
 * with a linked wallet may join the queue.
 */
import type { QueueEvent } from "./types";

export function clientEventRefusal(
  event: QueueEvent,
  linked: boolean,
): "invalid-transition" | "not-linked" | null {
  if (event.type === "uploaded" || event.type === "verified" || event.type === "finalize") {
    return "invalid-transition";
  }
  return event.type === "join" && !linked ? "not-linked" : null;
}
