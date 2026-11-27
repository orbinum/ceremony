/** Whether a CLI token still covers a whole session (the active cap and some margin): a session must not outlive it. */
import { SESSION_RULES } from "@orbinum-ceremony/core";
import { tokenLifeMs } from "./token-life-ms";

export const tokenLastsASession = (token: string) =>
  tokenLifeMs(token, Date.now()) >= SESSION_RULES.cliTokenMinMs;
