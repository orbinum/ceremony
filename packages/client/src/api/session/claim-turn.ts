/** Claims the turn the line offers this account. */
import { CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { call } from "../http";

export const claimTurn = () => call<{ ok: true }>("POST", CONTRIBUTOR_PATHS.claim);
