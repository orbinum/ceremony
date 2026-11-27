/** Leaves the line, or gives back a turn not yet started. */
import { CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { call } from "../http";

export const leaveQueue = () => call<{ ok: true }>("POST", CONTRIBUTOR_PATHS.leave);
