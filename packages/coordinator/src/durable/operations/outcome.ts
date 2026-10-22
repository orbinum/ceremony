/** What one call to the ceremony's object returns: the effects, or why it was refused. */
import type { CeremonyRefusal, QueueEffect } from "@orbinum-ceremony/core";

/** The result of a state-changing call; a refusal may list the problems behind it. */
export type Outcome =
  | { ok: true; effects: QueueEffect[] }
  | { ok: false; refusal: CeremonyRefusal; problems?: string[] };

/** A refusal. */
export const refuse = (refusal: CeremonyRefusal, problems?: string[]) =>
  ({ ok: false, refusal, ...(problems ? { problems } : {}) }) as const;

/** A success with its effects. */
export const done = (effects: QueueEffect[] = []): Outcome => ({ ok: true, effects });
