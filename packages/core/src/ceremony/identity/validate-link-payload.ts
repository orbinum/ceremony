/** A link payload for a scheme; the nonce must be exactly as issued (lowercase hex). */
import { asCeremonyId, asPositiveInt, asRecord } from "../../primitives/schema";
import { asAccount } from "./as-account";
import { asGithubLogin } from "./as-github-login";
import { asIssuedAt } from "./as-issued-at";
import { asLinkNonce } from "./as-link-nonce";
import type { LinkPayload, Scheme } from "./types";

export function validateLinkPayload(v: unknown, scheme: Scheme, p = "link"): LinkPayload {
  const o = asRecord(v, p, [
    "ceremony_id",
    "github_id",
    "github_login",
    "account",
    "nonce",
    "issued_at",
  ]);
  return {
    ceremony_id: asCeremonyId(o.ceremony_id, `${p}.ceremony_id`),
    github_id: asPositiveInt(o.github_id, `${p}.github_id`),
    github_login: asGithubLogin(o.github_login, `${p}.github_login`),
    account: asAccount(o.account, `${p}.account`, scheme),
    nonce: asLinkNonce(o.nonce, `${p}.nonce`),
    issued_at: asIssuedAt(o.issued_at, `${p}.issued_at`),
  };
}
