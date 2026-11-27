/** Ends the session without an attestation (`busy` while a verification is in flight). */
import { CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { call } from "../http";

export const finishSession = () => call<{ ok: true }>("POST", CONTRIBUTOR_PATHS.finish);
