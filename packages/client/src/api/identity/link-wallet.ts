/** Binds the wallet that signed `payload` to the signed-in GitHub account. */
import type { LinkPayload, Scheme } from "@orbinum-ceremony/core";
import { call } from "../http";

export const linkWallet = (scheme: Scheme, payload: LinkPayload, signature: string) =>
  call<{ ok: true }>("POST", "/api/link", { scheme, payload, signature });
