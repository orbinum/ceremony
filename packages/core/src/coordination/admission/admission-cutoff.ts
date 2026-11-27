/**
 * The moment a GitHub account must predate: when the ceremony's inputs were frozen (`init.json`
 * `created_at`). It is published and pinned by the announcement, and earlier than it, so nobody
 * can open an account after learning the ceremony exists.
 */
import type { InitRecord } from "../../ceremony";

export const admissionCutoff = (init: Pick<InitRecord, "created_at">): number =>
  Date.parse(init.created_at);
