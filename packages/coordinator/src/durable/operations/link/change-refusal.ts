/**
 * Why a linked account may not change its wallet now, or null (also when it has none): an account
 * may change it until a contribution names it.
 */
import { relinkRefusal } from "@orbinum-ceremony/core";
import * as db from "../../db";
import type { Store } from "../../store";
import { standingOf } from "./standing-of";

export const changeRefusal = (store: Store, githubId: number) =>
  db.readIdentity(store.sql, githubId) ? relinkRefusal(standingOf(store, githubId)) : null;
