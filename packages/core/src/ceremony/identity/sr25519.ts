/** The exact text sr25519 wallets sign: prefix, message type, payload as JCS. SPEC §3.7. */
import { canonicalJson } from "../../primitives/hashing";
import type { AttestationPayload, LinkPayload } from "./types";

/**
 * First line of every sr25519 message: separates our messages from anything else a wallet signs.
 */
const SR25519_PREFIX = "Orbinum Trusted Setup v1";

/**
 * The exact text an sr25519 wallet signs with `signRaw` (SPEC §3.7): prefix, message type, then
 * the payload as RFC 8785 JSON. The type line keeps a link from being replayed as an attestation.
 * Extensions wrap it as `<Bytes>…</Bytes>`; the verifier accepts both forms.
 */
export function sr25519Message(type: "link", payload: LinkPayload): string;
export function sr25519Message(type: "attestation", payload: AttestationPayload): string;
export function sr25519Message(
  type: "link" | "attestation",
  payload: LinkPayload | AttestationPayload,
): string {
  return `${SR25519_PREFIX}\n${type}\n${canonicalJson(payload)}`;
}
