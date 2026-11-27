/** Ends the browser's session with the coordinator. */
import { call } from "../http";

export const signOut = () => call<{ ok: true }>("POST", "/auth/logout");
