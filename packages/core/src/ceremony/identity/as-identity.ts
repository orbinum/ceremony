/** A transcript identity: login and account under the rules of its scheme, and its link fields. */
import { asOneOf, asPositiveInt, asRecord } from "../../primitives/schema";
import { asAccount } from "./as-account";
import { asGithubLogin } from "./as-github-login";
import { asIssuedAt } from "./as-issued-at";
import { asLinkNonce } from "./as-link-nonce";
import { SCHEMES } from "./constants";
import type { Identity } from "./types";

export function asIdentity(v: unknown, p: string): Identity {
  const o = asRecord(v, p, [
    "github_id",
    "github_login",
    "account",
    "scheme",
    "nonce",
    "issued_at",
  ]);
  const scheme = asOneOf(o.scheme, `${p}.scheme`, SCHEMES);
  return {
    github_id: asPositiveInt(o.github_id, `${p}.github_id`),
    github_login: asGithubLogin(o.github_login, `${p}.github_login`),
    account: asAccount(o.account, `${p}.account`, scheme),
    scheme,
    nonce: asLinkNonce(o.nonce, `${p}.nonce`),
    issued_at: asIssuedAt(o.issued_at, `${p}.issued_at`),
  };
}
