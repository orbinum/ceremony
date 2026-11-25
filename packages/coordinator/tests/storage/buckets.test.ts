/**
 * One folder per ceremony in each network's buckets (SPEC §6.1): every key the Worker uses lands in
 * its ceremony's folder, no key reaches another folder, and only announced folders are listed.
 */
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  archivedBucket,
  archivedCeremonies,
  privateBucket,
  publicBucket,
  scoped,
} from "../../src/storage";
import { clearBuckets, FOLDER } from "../support";

beforeEach(clearBuckets);

const rawKeys = async (bucket: R2Bucket) => (await bucket.list()).objects.map((o) => o.key);

describe("scoped", () => {
  it("puts, reads, heads and deletes inside the ceremony's folder only", async () => {
    const b = scoped(env.PUBLIC, "ceremony-a");
    await b.put("genesis/shield.genesis.zkey", "bytes");
    expect(await rawKeys(env.PUBLIC)).toEqual(["ceremony-a/genesis/shield.genesis.zkey"]);
    expect(await (await b.get("genesis/shield.genesis.zkey"))?.text()).toBe("bytes");
    expect(await b.head("genesis/shield.genesis.zkey")).not.toBeNull();
    expect(await scoped(env.PUBLIC, "ceremony-b").head("genesis/shield.genesis.zkey")).toBeNull();
    await b.put("logs/shield/1.log", "log");
    await b.delete(["genesis/shield.genesis.zkey", "logs/shield/1.log"]);
    expect(await rawKeys(env.PUBLIC)).toEqual([]);
  });

  it("never reaches another folder, whatever the key spells", async () => {
    await env.PUBLIC.put("ceremony-b/ceremony.json", "theirs");
    const a = scoped(env.PUBLIC, "ceremony-a");
    for (const key of [
      "../ceremony-b/ceremony.json",
      "/ceremony-b/ceremony.json",
      "ceremony-b/ceremony.json",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one key at a time
      expect([key, await a.head(key)]).toEqual([key, null]);
    }
    await a.put("../ceremony-b/ceremony.json", "mine");
    expect(await (await env.PUBLIC.get("ceremony-b/ceremony.json"))?.text()).toBe("theirs");
    expect(await rawKeys(env.PUBLIC)).toContain("ceremony-a/../ceremony-b/ceremony.json");
  });

  it("refuses a folder that is not a ceremony id", () => {
    for (const id of ["", "a/b", "..", "A", "x".repeat(65)]) {
      expect(() => scoped(env.PUBLIC, id).head("ceremony.json")).toThrow(/ceremony id/);
    }
  });

  it("gives this deployment its own ceremony's folder in both buckets", async () => {
    await publicBucket(env).put("ceremony.json", "{}");
    await privateBucket(env).put("verify/1/shield/1-x.zkey", "upload");
    expect(await rawKeys(env.PUBLIC)).toEqual([`${FOLDER}ceremony.json`]);
    expect(await rawKeys(env.PRIVATE)).toEqual([`${FOLDER}verify/1/shield/1-x.zkey`]);
    expect(await (await archivedBucket(env, env.CEREMONY_ID).get("ceremony.json"))?.text()).toBe(
      "{}",
    );
  });
});

describe("archivedCeremonies", () => {
  it("lists the announced folders only, in name order", async () => {
    await env.PUBLIC.put("orbinum-testnet-b/ceremony.json", "{}");
    await env.PUBLIC.put("orbinum-testnet-a/ceremony.json", "{}");
    // Set up but never announced (publish-init writes ceremony.json last).
    await env.PUBLIC.put("orbinum-testnet-c/genesis/init.json", "{}");
    // Not a ceremony folder.
    await env.PUBLIC.put("Not_A_Ceremony/ceremony.json", "{}");
    await env.PUBLIC.put("ceremony.json", "{}");
    expect(await archivedCeremonies(env)).toEqual(["orbinum-testnet-a", "orbinum-testnet-b"]);
  });

  it("is empty before any ceremony is announced", async () => {
    expect(await archivedCeremonies(env)).toEqual([]);
  });
});

describe("the Worker's sources", () => {
  // Every bucket call goes through storage/buckets.ts: no other module may name the bindings.
  const sources = import.meta.glob<string>("../../src/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });

  it("name the PUBLIC and PRIVATE bindings only in storage/buckets.ts", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    const naming = Object.entries(sources)
      .filter(([, text]) => /\b(PUBLIC|PRIVATE)\b/.test(text))
      .map(([path]) => path);
    expect(naming).toEqual(["../../src/storage/buckets.ts"]);
  });
});
