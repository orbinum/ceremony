/**
 * The exact text an sr25519 or ed25519 wallet signs: a prefix line that separates our messages
 * from anything else a wallet signs, the message type (which keeps a link from being replayed as
 * an attestation), then the payload as RFC 8785 JSON. Extensions wrap it as `<Bytes>…</Bytes>`
 * (`signRaw`), Solana wallets sign it bare (`solana:signMessage`); the verifier accepts both.
 */
import { canonicalJson } from "../../../primitives/hashing";
import type { AttestationPayload, LinkPayload } from "../types";

const SR25519_PREFIX = "Orbinum Trusted Setup v1";

export function sr25519Message(type: "link", payload: LinkPayload): string;
export function sr25519Message(type: "attestation", payload: AttestationPayload): string;
export function sr25519Message(
  type: "link" | "attestation",
  payload: LinkPayload | AttestationPayload,
): string {
  return `${SR25519_PREFIX}\n${type}\n${canonicalJson(payload)}`;
}
