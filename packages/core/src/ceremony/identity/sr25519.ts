/**
 * The exact text SS58 accounts sign, sr25519 or ed25519: prefix, message type, payload as JCS.
 * SPEC §3.7.
 */
import { canonicalJson } from "../../primitives/hashing";
import type { AttestationPayload, LinkPayload } from "./types";

/**
 * First line of every sr25519 message: separates our messages from anything else a wallet signs.
 */
const SR25519_PREFIX = "Orbinum Trusted Setup v1";

/**
 * The exact text an sr25519 or ed25519 wallet signs (SPEC §3.7): prefix, message type, then the
 * payload as RFC 8785 JSON. The type line keeps a link from being replayed as an attestation.
 * Extensions wrap it as `<Bytes>…</Bytes>` (`signRaw`), Solana wallets sign it bare
 * (`solana:signMessage`); the verifier accepts both forms.
 */
export function sr25519Message(type: "link", payload: LinkPayload): string;
export function sr25519Message(type: "attestation", payload: AttestationPayload): string;
export function sr25519Message(
  type: "link" | "attestation",
  payload: LinkPayload | AttestationPayload,
): string {
  return `${SR25519_PREFIX}\n${type}\n${canonicalJson(payload)}`;
}
