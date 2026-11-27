/** A token for `orbinum-ceremony contribute`, valid as long as this session. */
import { call } from "../http";

export const cliToken = () =>
  call<{ ok: true; token: string; expiresAt: number }>("POST", "/api/cli-token");
