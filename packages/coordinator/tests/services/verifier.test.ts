/**
 * Dispatch to the verifier (COORDINATOR §5): exactly the job, HMAC-signed for this ceremony, once
 * per accepted upload; a redirect is refused, the answer released, and a failure never fails the
 * upload.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { sha256Hex, verifyRequest } from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatch } from "../../src/services";
import {
  appWith,
  claimOf,
  freshId,
  GENESIS_SHA256,
  json,
  linkDirect,
  routedTo,
  setupInput,
  stubOf,
} from "../support";

const BYTES = new TextEncoder().encode("a dispatched upload");

/** A fresh ceremony in which identity 1 holds a claimed session; its object's name. */
async function inSession() {
  const name = freshId("dispatch");
  const stub = stubOf(name);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, 1);
  await stub.apply({ type: "join", githubId: 1 });
  await stub.apply({ type: "claim", githubId: 1 });
  return name;
}

const headerOf = (init: RequestInit | undefined, name: string) =>
  (init?.headers as Record<string, string> | undefined)?.[name];

describe("dispatch to the verifier", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts exactly the job, signed for this ceremony, once per accepted upload", async () => {
    const name = await inSession();
    let cancelled = false;
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      seen.push({ url: String(input), init });
      const body = new ReadableStream({
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body, { status: 202 });
    });
    const r = await appWith(
      { VERIFIER_URL: "https://verifier.test", ...routedTo(name) },
      "http://localhost/api/session/upload/shield",
      {
        method: "PUT",
        headers: {
          "x-dev-github-id": "1",
          "x-ceremony-claim": JSON.stringify(claimOf(BYTES, GENESIS_SHA256.shield)),
          "content-length": String(BYTES.length),
        },
        body: BYTES,
      },
    );
    expect(r.status).toBe(202);
    const { job } = await json(r);
    const posts = seen.filter((s) => s.url === "https://verifier.test/verify");
    expect(posts).toHaveLength(1);
    const { init } = posts[0]!;
    const body = String(init?.body);
    expect([init?.method, init?.redirect]).toEqual(["POST", "manual"]);
    expect(JSON.parse(body).job).toEqual(job);
    expect(JSON.parse(body).claim.outputSha256).toBe(sha256Hex(BYTES));
    const headers = {
      timestamp: headerOf(init, "x-ceremony-timestamp"),
      signature: headerOf(init, "x-ceremony-signature"),
    };
    const verify = (ceremonyId: string) =>
      verifyRequest(
        env.VERIFIER_HMAC_KEY,
        ceremonyId,
        "POST",
        "/verify",
        body,
        headers,
        Date.now(),
      );
    expect([verify(env.CEREMONY_ID), verify("mainnet-1")]).toEqual([true, false]);
    expect(cancelled).toBe(true);
  });

  it("without VERIFIER_URL, hands the job to this ceremony's verifier container", async () => {
    const enqueued: { name: string; spec: unknown }[] = [];
    const VERIFIER_CONTAINER = {
      getByName: (name: string) => ({
        enqueue: async (spec: unknown) => void enqueued.push({ name, spec }),
      }),
    } as unknown as Env["VERIFIER_CONTAINER"];
    const fetch = vi.spyOn(globalThis, "fetch");
    const spec = { job: { circuit: "shield" } } as never;
    await dispatch({ ...env, VERIFIER_URL: "", VERIFIER_CONTAINER }, spec);
    expect(enqueued).toEqual([{ name: env.CEREMONY_ID, spec }]);
    // VERIFIER_URL wins: the container is never asked.
    fetch.mockResolvedValue(new Response(null, { status: 202 }));
    await dispatch({ ...env, VERIFIER_URL: "https://verifier.test", VERIFIER_CONTAINER }, spec);
    expect(enqueued).toHaveLength(1);
  });

  it("never fails the upload when the verifier is unreachable or answers otherwise", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spec = {} as never;
    const to = { ...env, VERIFIER_URL: "https://verifier.test" };
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unreachable"));
    await expect(dispatch(to, spec)).resolves.toBeUndefined();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("moved", { status: 500 }));
    await expect(dispatch(to, spec)).resolves.toBeUndefined();
    expect(errors.mock.calls.map((c) => String(c[0]))).toContain(
      "dispatch: the verifier answered 500",
    );
  });

  it("treats a redirect as a failed dispatch and never follows it", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const to = { ...env, VERIFIER_URL: "https://verifier.test" };
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(null, { status: 307, headers: { location: "https://elsewhere.test/verify" } }),
      );
    await dispatch(to, {} as never);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls.map((c) => String(c[0]))).toContain(
      "dispatch: the verifier answered 307",
    );
  });

  it("sends the verifier's Access service token over https only, and only when set", async () => {
    const token = {
      VERIFIER_ACCESS_CLIENT_ID: "id.access",
      VERIFIER_ACCESS_CLIENT_SECRET: "s3cret",
    };
    const sent: (RequestInit | undefined)[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      sent.push(init);
      return new Response(null, { status: 202 });
    });
    await dispatch({ ...env, VERIFIER_URL: "https://verifier.test", ...token }, {} as never);
    await dispatch({ ...env, VERIFIER_URL: "http://127.0.0.1:8788", ...token }, {} as never);
    await dispatch({ ...env, VERIFIER_URL: "https://verifier.test" }, {} as never);
    expect(sent.map((i) => headerOf(i, "cf-access-client-id"))).toEqual([
      "id.access",
      undefined,
      undefined,
    ]);
    expect(headerOf(sent[0], "cf-access-client-secret")).toBe("s3cret");
    // The HMAC signature is still there next to the token.
    expect(sent.every((i) => headerOf(i, "x-ceremony-signature"))).toBe(true);
  });

  it("sends nothing without a verifier", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await dispatch({ ...env, VERIFIER_URL: "" }, {} as never);
    expect(fetch).not.toHaveBeenCalled();
  });
});
