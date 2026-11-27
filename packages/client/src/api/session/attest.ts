/** Records the signed attestation; it also ends the session if it is still open. */
import type { AttestationPayload } from "@orbinum-ceremony/core";
import { call } from "../http";

export const attest = (payload: AttestationPayload, signature: string) =>
  call<{ ok: true }>("POST", "/api/session/attest", { payload, signature });
