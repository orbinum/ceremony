/**
 * What decides whether a linked account may change its wallet: whether a contribution names it,
 * and whether it holds the slot.
 */
import type { RelinkStanding } from "@orbinum-ceremony/core";
import * as db from "../../db";
import { records, type Store } from "../../store";

export const standingOf = (store: Store, githubId: number): RelinkStanding => ({
  contributed: records(store).some(
    (r) => r.type === "contribution" && r.identity?.github_id === githubId,
  ),
  inTurn: db.readQueue(store.sql)?.slot?.githubId === githubId,
});
