/** A link payload as the EIP-712 typed data an EVM wallet signs and the verifier recovers from. */
import { hex0x } from "../../../primitives/encoding";
import { EIP712_TYPES } from "../constants";
import { eip712Domain } from "./eip712-domain";
import type { LinkPayload, TypedData } from "../types";

export function linkTypedData(p: LinkPayload): TypedData<"Link"> {
  const { EIP712Domain, Link } = EIP712_TYPES;
  return {
    domain: eip712Domain(p.ceremony_id),
    types: { EIP712Domain, Link },
    primaryType: "Link",
    message: {
      ceremonyId: p.ceremony_id,
      githubId: p.github_id,
      githubLogin: p.github_login,
      account: p.account,
      nonce: hex0x(p.nonce),
      issuedAt: p.issued_at,
    },
  };
}
