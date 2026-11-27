/** Stops a run whose CLI token would expire mid-session; `waiting` says its place in line is kept. */
import { SESSION_RULES } from "@orbinum-ceremony/core";
import { TokenRefused } from "../retry";
import { tokenLastsASession } from "./token-lasts-a-session";

export function assertTokenLife(token: string, waiting: boolean) {
  if (tokenLastsASession(token)) return;
  const minutes = SESSION_RULES.cliTokenMinMs / 60_000;
  const kept = waiting ? " and run again (your place in line is kept)" : "";
  throw new TokenRefused(
    `the CLI token expires within ${minutes} min: create a new one in the browser${kept}`,
  );
}
