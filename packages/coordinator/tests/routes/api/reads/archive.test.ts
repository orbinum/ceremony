/**
 * `/api/archive` and `/archive/<id>/*`: every ceremony this network published (announced once
 * `ceremony.json` is written), listed, and its files read-only and inert like `/artifacts`, so a
 * finished ceremony stays verifiable after the deployment moves on. A folder never announced is
 * not served, except the current ceremony's.
 */
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { clearBuckets, FOLDER, PUBLIC, raw, refusal } from "../../../support";

beforeEach(clearBuckets);

const EARLIER = "orbinum-testnet-earlier-1";

describe("/archive", () => {
  it("lists the announced ceremonies and names the current one", async () => {
    await env.PUBLIC.put(`${EARLIER}/ceremony.json`, "{}");
    await PUBLIC.put("ceremony.json", "{}");
    const r = await raw("/api/archive");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      current: env.CEREMONY_ID,
      ceremonies: [EARLIER, env.CEREMONY_ID].toSorted(),
    });
  });

  it("names no current ceremony before it is announced", async () => {
    await env.PUBLIC.put(`${EARLIER}/ceremony.json`, "{}");
    await PUBLIC.put("genesis/init.json", "{}");
    expect(await (await raw("/api/archive")).json()).toEqual({
      current: null,
      ceremonies: [EARLIER],
    });
  });

  it("serves an earlier ceremony's files, which /artifacts never does", async () => {
    await env.PUBLIC.put(`${EARLIER}/ceremony.json`, "{}");
    await env.PUBLIC.put(`${EARLIER}/transcript.json`, "earlier transcript", {
      httpMetadata: { contentType: "application/json" },
    });
    const r = await raw(`/archive/${EARLIER}/transcript.json`);
    expect([r.status, await r.text()]).toEqual([200, "earlier transcript"]);
    expect(r.headers.get("content-type")).toBe("application/json");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(await refusal(await raw("/artifacts/transcript.json"))).toEqual([404, "not-found"]);
  });

  it("serves the current ceremony too, announced or not, the same bytes as /artifacts", async () => {
    await PUBLIC.put("status.json", '{"phase":"OPEN"}');
    const archived = await raw(`/archive/${env.CEREMONY_ID}/status.json`);
    const current = await raw("/artifacts/status.json");
    expect(await archived.text()).toBe(await current.text());
  });

  it("caches genesis keys for good and revalidates everything else, by the key in the folder", async () => {
    await env.PUBLIC.put(`${EARLIER}/ceremony.json`, "{}");
    await env.PUBLIC.put(`${EARLIER}/genesis/shield.genesis.zkey`, "g");
    await env.PUBLIC.put(`${EARLIER}/final/shield.final.zkey`, "f");
    const genesis = await raw(`/archive/${EARLIER}/genesis/shield.genesis.zkey`);
    expect(genesis.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const final = await raw(`/archive/${EARLIER}/final/shield.final.zkey`);
    expect(final.headers.get("cache-control")).toBe("no-cache");
    const etag = final.headers.get("etag") ?? "";
    const again = await raw(`/archive/${EARLIER}/final/shield.final.zkey`, {
      headers: { "if-none-match": etag },
    });
    expect([again.status, await again.text()]).toEqual([304, ""]);
  });
});

describe("/archive attacks", () => {
  it("never serves the private bucket", async () => {
    await env.PRIVATE.put(`${EARLIER}/verify/1/shield/1-secret.zkey`, "private");
    await env.PRIVATE.put(`${FOLDER}verify/1/shield/1-secret.zkey`, "private");
    for (const id of [EARLIER, env.CEREMONY_ID]) {
      const r = await raw(`/archive/${id}/verify/1/shield/1-secret.zkey`);
      expect([id, r.status]).toEqual([id, 404]);
    }
  });

  it("serves nothing of a folder never announced, answering as a missing file", async () => {
    const NEXT = "orbinum-testnet-next-1";
    await env.PUBLIC.put(`${NEXT}/genesis/init.json`, '{"ceremony_id":"next"}');
    await env.PUBLIC.put(`${NEXT}/genesis/shield.genesis.zkey`, "g");
    for (const key of ["genesis/init.json", "genesis/shield.genesis.zkey", "missing.json"]) {
      const r = await raw(`/archive/${NEXT}/${key}`);
      expect([key, ...(await refusal(r))]).toEqual([key, 404, "not-found"]);
    }
    await env.PUBLIC.put(`${NEXT}/ceremony.json`, "{}");
    const announced = await raw(`/archive/${NEXT}/genesis/init.json`);
    expect([announced.status, await announced.text()]).toEqual([200, '{"ceremony_id":"next"}']);
  });

  it("answers anything that is not a ceremony id and a key as not found", async () => {
    await env.PUBLIC.put(`${EARLIER}/ceremony.json`, "{}");
    await env.PUBLIC.put("ceremony.json", "outside any folder");
    for (const path of [
      "/archive",
      `/archive/${EARLIER}`,
      `/archive/${EARLIER}/`,
      "/archive/ceremony.json",
      "/archive/%2e%2e/ceremony.json",
      `/archive/..%2f${EARLIER}/ceremony.json`,
      `/archive/${EARLIER}%2fceremony.json`,
      `/archive/${EARLIER.toUpperCase()}/ceremony.json`,
      `/archive/${EARLIER}/../ceremony.json`,
      `/archive/${EARLIER}/..%2f..%2fceremony.json`,
      `/archive/${"a".repeat(65)}/ceremony.json`,
      `/archive/${EARLIER}/${"a".repeat(960)}`,
      `/archive/${EARLIER}/%E0%A4%A`,
    ]) {
      const r = await raw(path);
      expect([path, r.status]).toEqual([path, 404]);
    }
  });
});
