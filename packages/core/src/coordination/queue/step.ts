/**
 * The queue as a pure state machine: one event applied at `now`. The Durable Object persists the
 * returned state, runs the effects and sets its single alarm to `nextDeadline`; every rule lives in
 * the handlers, so it is tested without workerd. The input state is never mutated and a refused
 * event leaves it untouched. Whatever expired by `now` takes effect first, as if the alarm had
 * fired on time: nothing is accepted after its deadline or the close, however late the alarm runs.
 * A sealed ceremony refuses everything.
 */
import { QUEUE_RULES } from "../../config";
import * as on from "./handlers";
import type {
  QueueEvent,
  QueueRefusal,
  QueueRules,
  QueueState,
  StepContext,
  StepResult,
} from "./types";

const isGithubId = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;

function dispatch(ctx: StepContext, event: QueueEvent): QueueRefusal | null {
  switch (event.type) {
    case "tick":
      return on.tick(ctx);
    case "join":
      return on.join(ctx, event);
    case "leave":
      return on.leave(ctx, event);
    case "claim":
      return on.claim(ctx, event);
    case "heartbeat":
      return on.heartbeat(ctx, event);
    case "uploaded":
      return on.uploaded(ctx, event);
    case "verified":
      return on.verified(ctx, event);
    case "finish":
      return on.finish(ctx, event);
    case "pause":
      return on.pause(ctx);
    case "resume":
      return on.resume(ctx);
    case "close":
      return on.close(ctx);
    case "unhold":
      return on.unhold(ctx, event);
    case "finalize":
      return on.finalize(ctx);
  }
}

export function step(
  current: QueueState,
  event: QueueEvent,
  now: number,
  rules: QueueRules = QUEUE_RULES,
): StepResult {
  if ("githubId" in event && !isGithubId(event.githubId)) {
    return { ok: false, state: current, refusal: "malformed" };
  }
  if (current.phase === "FINALIZED" && event.type !== "tick") {
    return { ok: false, state: current, refusal: "finalized" };
  }
  const ctx: StepContext = { s: structuredClone(current), effects: [], now, rules };
  if (event.type !== "tick") on.tick(ctx);
  const refusal = dispatch(ctx, event);
  return refusal === null
    ? { ok: true, state: ctx.s, effects: ctx.effects }
    : { ok: false, state: current, refusal };
}
