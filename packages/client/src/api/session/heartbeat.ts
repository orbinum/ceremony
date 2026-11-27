/** One heartbeat: keeps the claimed turn alive. */
import { CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { call } from "../http";

export const heartbeat = () => call<{ ok: true }>("POST", CONTRIBUTOR_PATHS.heartbeat);
