/** A single-use nonce for the wallet link payload. */
import { call } from "../http";

export const linkNonce = () =>
  call<{ nonce: string; expiresAt: number }>("POST", "/api/link/nonce");
