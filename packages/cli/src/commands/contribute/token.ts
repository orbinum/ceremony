/** The CLI token's lifetime: a session must not outlive it. */
import { SESSION_RULES } from "@orbinum-ceremony/core";
import { TokenRefused } from "./retry";

/** The lifetime left to a CLI token, from its own (unverified) payload; 0 if it has none. */
export function tokenLifeMs(token: string, now: number): number {
  try {
    const body = token.slice(0, token.indexOf("."));
    const exp = (JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { exp?: unknown })
      .exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp - now : 0;
  } catch {
    return 0;
  }
}

/** Whether `token` still covers a whole session (the active cap and some margin). */
export const tokenLastsASession = (token: string) =>
  tokenLifeMs(token, Date.now()) >= SESSION_RULES.cliTokenMinMs;

/** Stops a run whose token would expire mid-session; `waiting` says its place in line is kept. */
export function assertTokenLife(token: string, waiting: boolean) {
  if (tokenLastsASession(token)) return;
  const minutes = SESSION_RULES.cliTokenMinMs / 60_000;
  const kept = waiting ? " and run again (your place in line is kept)" : "";
  throw new TokenRefused(
    `the CLI token expires within ${minutes} min: create a new one in the browser${kept}`,
  );
}
