/** `GET /api/queue/me`: one's place in line, or one's session. */
import { CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { call } from "../http";
import type { Slot } from "../types";

export const getSlot = () => call<Slot>("GET", CONTRIBUTOR_PATHS.me);
