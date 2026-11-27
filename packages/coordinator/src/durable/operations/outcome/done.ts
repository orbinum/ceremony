/** A successful call with its effects (none by default). */
import type { QueueEffect } from "@orbinum-ceremony/core";
import type { Outcome } from "../types";

export const done = (effects: QueueEffect[] = []): Outcome => ({ ok: true, effects });
