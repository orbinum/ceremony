/** Validators for identities, client info and the payloads wallets sign. SPEC §3.4–3.5, §6.3. */
import { CIRCUIT_ORDER, LINK_RULES } from "../../config";
import { FormatError } from "../../primitives/errors";
import {
  asArray,
  asCeremonyId,
  asHex,
  asOneOf,
  asPositiveInt,
  asRecord,
  asSafeInt,
  asString,
  asU32,
  GITHUB_LOGIN,
  NONEMPTY_PRINTABLE,
  SHORT_COMMIT,
} from "../../primitives/schema";
import { asAccount } from "./account";
import {
  type AttestationPayload,
  type ClientInfo,
  type Identity,
  type LinkPayload,
  type Scheme,
  SCHEMES,
} from "./types";

/** A GitHub login. */
export const asGithubLogin = (v: unknown, p: string): string => asString(v, p, 39, GITHUB_LOGIN);

/**
 * The commit of an unversioned local build: only simulated (`contribute-local`) records carry it.
 */
export const LOCAL_BUILD = "local";

/** The verifier version a simulated contribution records: the cli verified it in-process. */
export const LOCAL_VERIFIER = "cli-local";

/**
 * A client build: printable name and version, a 7–40 hex commit. `allowLocal` also accepts
 * `LOCAL_BUILD`, for transcripts of simulated ceremonies; signed and online paths never do.
 */
export function asClientInfo(v: unknown, p: string, { allowLocal = false } = {}): ClientInfo {
  const o = asRecord(v, p, ["name", "version", "commit"]);
  return {
    name: asString(o.name, `${p}.name`, 64, NONEMPTY_PRINTABLE),
    version: asString(o.version, `${p}.version`, 32, NONEMPTY_PRINTABLE),
    commit:
      allowLocal && o.commit === LOCAL_BUILD
        ? LOCAL_BUILD
        : asString(o.commit, `${p}.commit`, 40, SHORT_COMMIT),
  };
}

const asNonce = (v: unknown, p: string): string => asHex(v, p, LINK_RULES.nonceBytes);

const asIssuedAt = (v: unknown, p: string): number => asSafeInt(v, p, 0, 2 ** 40);

/** A transcript identity: login and account under the rules of its scheme, and its link fields. */
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
    nonce: asNonce(o.nonce, `${p}.nonce`),
    issued_at: asIssuedAt(o.issued_at, `${p}.issued_at`),
  };
}

/** A link payload for `scheme`; the nonce must be exactly as issued (lowercase hex). */
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
    nonce: asNonce(o.nonce, `${p}.nonce`),
    issued_at: asIssuedAt(o.issued_at, `${p}.issued_at`),
  };
}

/**
 * An attestation payload for `scheme`: at least one contribution, circuits in session order and
 * each at most once, so one session has exactly one signable form.
 */
export function validateAttestationPayload(
  v: unknown,
  scheme: Scheme,
  p = "attestation",
): AttestationPayload {
  const o = asRecord(v, p, [
    "ceremony_id",
    "github_id",
    "account",
    "seq",
    "contributions",
    "client",
  ]);
  const contributions = asArray(o.contributions, `${p}.contributions`, CIRCUIT_ORDER.length, 1).map(
    (c, i) => {
      const q = `${p}.contributions[${i}]`;
      const e = asRecord(c, q, [
        "circuit",
        "index",
        "input_sha256",
        "output_sha256",
        "contribution_hash",
      ]);
      return {
        circuit: asOneOf(e.circuit, `${q}.circuit`, CIRCUIT_ORDER),
        index: asU32(e.index, `${q}.index`),
        input_sha256: asHex(e.input_sha256, `${q}.input_sha256`, 32),
        output_sha256: asHex(e.output_sha256, `${q}.output_sha256`, 32),
        contribution_hash: asHex(e.contribution_hash, `${q}.contribution_hash`, 64),
      };
    },
  );
  const order = contributions.map((c) => CIRCUIT_ORDER.indexOf(c.circuit));
  if (order.some((x, i) => i > 0 && x <= (order[i - 1] as number))) {
    throw new FormatError(`${p}.contributions: circuits out of session order or repeated`);
  }
  return {
    ceremony_id: asCeremonyId(o.ceremony_id, `${p}.ceremony_id`),
    github_id: asPositiveInt(o.github_id, `${p}.github_id`),
    account: asAccount(o.account, `${p}.account`, scheme),
    seq: asU32(o.seq, `${p}.seq`),
    contributions,
    client: asClientInfo(o.client, `${p}.client`),
  };
}
