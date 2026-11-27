/** A refused call, listing the problems behind it when there are any. */
import type { CeremonyRefusal } from "@orbinum-ceremony/core";

export const refuse = (refusal: CeremonyRefusal, problems?: string[]) =>
  ({ ok: false, refusal, ...(problems ? { problems } : {}) }) as const;
