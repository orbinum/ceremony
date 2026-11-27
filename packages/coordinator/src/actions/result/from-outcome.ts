/**
 * A Durable Object outcome as an action's result: its effects stay internal, a refusal's problems
 * become the message.
 */
import type { Outcome } from "../../durable";
import type { Result } from "../types";
import { refuse } from "./refuse";
import { succeed } from "./succeed";

export const fromOutcome = (o: Outcome): Result =>
  o.ok ? succeed({}) : refuse(o.refusal, o.problems?.join("; ") || undefined);
