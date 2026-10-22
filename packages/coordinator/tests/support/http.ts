/**
 * Requests to the Worker as tests make them: a local run on `localhost` (optionally routed to an
 * object of its own), or the app under other bindings; the verifier's signed requests.
 */
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import {
  DEV_IDENTITY_HEADERS,
  OPERATOR_HEADER,
  signRequest,
  signToken,
} from "@orbinum-ceremony/core";
import { app } from "../../src/app";

/** The coordinator's origin in tests: loopback, so a local run's development identity applies. */
export const BASE = "http://localhost";

let ids = 0;
/** A name of its own for the ceremony's object: tests never share state through it. */
export const freshId = (prefix: string) =>
  `${prefix}-${++ids}-${crypto.getRandomValues(new Uint32Array(1))[0]?.toString(36)}`;

/**
 * Bindings that route the Worker to the object named `name` (same `CEREMONY_ID`): the ceremony
 * the Worker reaches is that object's.
 */
export const routedTo = (name: string): Partial<Env> => ({
  CEREMONY: {
    getByName: () => env.CEREMONY.getByName(name),
  } as unknown as Env["CEREMONY"],
});

let clients = 0;
/** A client address of its own, so per-address limits of one test never meet another's. */
const nextAddress = () => `10.${(++clients >> 16) & 255}.${(clients >> 8) & 255}.${clients & 255}`;

/** The real app under other bindings (another environment, host, ceremony or secrets). */
export async function appWith(
  patch: Partial<Env>,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.request(url, init, { ...env, ...patch }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

/** How `call` sends a request. */
interface CallInit {
  body?: unknown;
  cookie?: string;
  login?: string;
  headers?: Record<string, string>;
  /** The object to reach (`freshId`; this environment's by default). */
  ceremony?: string;
  /** Other bindings. */
  env?: Partial<Env>;
}

/** A request to the Worker, optionally as a GitHub identity (the development header). */
export function call(
  method: string,
  path: string,
  githubId?: number,
  init: CallInit = {},
): Promise<Response> {
  const headers: Record<string, string> = { "cf-connecting-ip": nextAddress(), ...init.headers };
  if (githubId !== undefined) {
    headers[DEV_IDENTITY_HEADERS.id] = String(githubId);
    headers[DEV_IDENTITY_HEADERS.login] = init.login ?? `user-${githubId}`;
  }
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body !== undefined) headers["content-type"] ??= "application/json";
  if (path.startsWith("/admin")) headers[OPERATOR_HEADER] ??= "1";
  const request: RequestInit = {
    method,
    headers,
    redirect: "manual",
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  };
  const patch = { ...init.env, ...(init.ceremony ? routedTo(init.ceremony) : {}) };
  return Object.keys(patch).length > 0
    ? appWith(patch, `${BASE}${path}`, request)
    : exports.default.fetch(`${BASE}${path}`, request);
}

/** The answer's JSON. */
export const json = async (r: Response) => (await r.json()) as Record<string, any>;

/** An error answer as `[status, code]`. */
export const refusal = async (r: Response) => [r.status, (await json(r)).error?.code];

/** A request from the verifier, HMAC-signed as the verifier service signs it. */
export function verifierCall(
  method: string,
  path: string,
  body?: unknown,
  init: {
    key?: string;
    now?: number;
    sentBody?: string;
    /** The object to reach (`freshId`). */
    ceremony?: string;
    /** The ceremony id signed (this environment's by default). */
    ceremonyId?: string;
    /** What the headers are signed for, when not what is sent (a replay elsewhere). */
    signedPath?: string;
    signedMethod?: string;
  } = {},
): Promise<Response> {
  const text = body === undefined ? "" : JSON.stringify(body);
  const headers = signRequest(
    init.key ?? env.VERIFIER_HMAC_KEY,
    init.ceremonyId ?? env.CEREMONY_ID,
    init.signedMethod ?? method,
    init.signedPath ?? path,
    text,
    init.now ?? Date.now(),
  );
  const sent = init.sentBody ?? text;
  return appWith(init.ceremony ? routedTo(init.ceremony) : {}, `${BASE}${path}`, {
    method,
    headers: { ...headers, ...(sent ? { "content-type": "application/json" } : {}) },
    ...(sent ? { body: sent } : {}),
  });
}

/** A session cookie as sign-in sets it (other scope, key or lifetime to forge a bad one). */
export function sessionCookie(
  gid: number,
  login = `user-${gid}`,
  opts: { scope?: string; key?: string; ttlMs?: number; now?: number } = {},
): string {
  const t = signToken(
    opts.scope ?? `session:${env.CEREMONY_ID}`,
    { gid, login },
    opts.key ?? env.SESSION_KEY,
    opts.ttlMs ?? 60_000,
    opts.now ?? Date.now(),
  );
  return `__Host-ceremony-session=${t}`;
}

/** A request to the Worker exactly as given (no identity, no defaults). */
export const raw = (path: string, init: RequestInit = {}) =>
  exports.default.fetch(`${BASE}${path}`, init);
