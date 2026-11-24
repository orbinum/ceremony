/**
 * Request input, validated before a handler runs (Hono validators over core's validators): a
 * route's handler reads `c.req.valid(…)` and never parses. Anything invalid is `400 malformed`.
 * COORDINATOR §3.
 */
import {
  asCircuitName,
  asDecimalId,
  asOneOf,
  CLAIM_HEADER,
  CONTENT_SHA256_HEADER,
  type ContributionClaim,
  isFinalFileKey,
  isSetupFileKey,
  MAX_CLAIM_BYTES,
  MAX_FILE_BYTES,
  normalizeHex,
  OPERATOR_ACTIONS,
  parseJsonText,
  type SetupInput,
  validateClaim,
  validateFinalizeRequest,
  validateJobId,
  validateLinkRequest,
  validateReport,
  validateUnholdRequest,
} from "@orbinum-ceremony/core";
import type { Context } from "hono";
import { validator } from "hono/validator";
import { contentLength } from "./body";
import { fail } from "./errors";

/** An input that is not acceptable, with the message to answer. */
class Malformed extends Error {}

/** Runs `parse`; any throw is `malformed` (with a `Malformed` error's own message). */
const checked =
  <V, T>(parse: (value: V, c: Context) => T) =>
  (value: V, c: Context): T | Response => {
    try {
      return parse(value, c);
    } catch (error) {
      return fail(c, "malformed", error instanceof Malformed ? error.message : "malformed");
    }
  };

/** A streamed body of exactly its declared `Content-Length`, within `max`. */
function streamedBody(c: Context, max: number) {
  const size = contentLength(c, max);
  const body = c.req.raw.body;
  if (size === null || !body) throw new Malformed("a body with Content-Length is required");
  return { size, body };
}

/** `:circuit`, a well-formed name; whether the ceremony has it is the route's to say. */
export const circuitParam = validator(
  "param",
  checked((p: Record<string, string>) => {
    try {
      return { circuit: asCircuitName(p.circuit, "circuit") };
    } catch {
      throw new Malformed("not a circuit name");
    }
  }),
);

/** `:seq`, a session number. */
export const seqParam = validator(
  "param",
  checked((p: Record<string, string>) => ({ seq: asDecimalId(p.seq, "seq") })),
);

/** `:seq/:circuit/:attempt`, a job id. */
export const jobIdParam = validator(
  "param",
  checked((p: Record<string, string>) => validateJobId(p)),
);

/** The public bucket key under `/artifacts/`; a path that is not one is not found. */
export const artifactKey = validator("param", (_, c) => {
  try {
    const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/artifacts\//, ""));
    // R2 keys are at most 1024 bytes: a longer one is not found, not a storage error.
    if (key.length > 0 && new TextEncoder().encode(key).length <= 1024) return { key };
  } catch {
    // A malformed escape is no key at all.
  }
  return fail(c, "not-found", "no such artifact");
});

/** An upload: its claim (JSON in `X-Ceremony-Claim`) and its streamed body. */
export const uploadInput = validator(
  "header",
  checked((h: Record<string, string>, c) => {
    let claim: ContributionClaim;
    try {
      const raw = h[CLAIM_HEADER];
      if (!raw || raw.length > MAX_CLAIM_BYTES) throw new Error("claim");
      claim = validateClaim(parseJsonText(raw, CLAIM_HEADER));
    } catch {
      throw new Malformed(`missing or malformed ${CLAIM_HEADER}`);
    }
    return { claim, ...streamedBody(c, MAX_FILE_BYTES) };
  }),
);

/**
 * A setup or final file: its key (a setup or final path only), declared SHA-256 and streamed
 * body.
 */
export const publicFileInput = validator(
  "header",
  checked((h: Record<string, string>, c) => {
    const key = new URL(c.req.url).pathname.replace(/^\/admin\/artifacts\//, "");
    if (!isSetupFileKey(key) && !isFinalFileKey(key)) {
      throw new Malformed(`not a setup or final file: ${key}`);
    }
    let sha256: string;
    try {
      sha256 = normalizeHex(h[CONTENT_SHA256_HEADER], CONTENT_SHA256_HEADER, 32);
    } catch {
      throw new Malformed(`${CONTENT_SHA256_HEADER} is required`);
    }
    return { key, sha256, ...streamedBody(c, MAX_FILE_BYTES) };
  }),
);

/** A JSON body read by core's `parse` (a body that is not `application/json` reads as `{}`). */
const jsonBody = <T>(parse: (value: unknown) => T) =>
  validator(
    "json",
    checked((value: unknown) => parse(value)),
  );

/** `POST /api/link`: scheme, payload, signature. */
export const linkRequest = jsonBody(validateLinkRequest);

/** `POST /internal/verifications`: a verifier report. */
export const reportBody = jsonBody(validateReport);

/** `POST /admin/state`: one operator action. */
export const operatorAction = jsonBody((v) => ({
  action: asOneOf((v as { action?: unknown }).action, "action", OPERATOR_ACTIONS),
}));

/** `POST /admin/unhold`: the identity whose hold is lifted. */
export const unholdBody = jsonBody(validateUnholdRequest);

/** `POST /admin/finalize`: the sealed beacon, chained, and the finals (core checks them later). */
export const finalizeBody = jsonBody(validateFinalizeRequest);

/** `POST /admin/configure`: the published texts and genesis sizes (core parses them later). */
export const setupInput = jsonBody((v): SetupInput => {
  const o = v as Partial<SetupInput>;
  if (typeof o.announcement !== "string" || typeof o.init !== "string") throw new Error("setup");
  return o as SetupInput;
});

/** The attestation body, read as JSON; validated by the action against the linked scheme. */
export const attestationBody = jsonBody((v) => ({ body: v }));
