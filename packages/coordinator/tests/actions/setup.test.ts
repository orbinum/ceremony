/**
 * Configuring (COORDINATOR §3): the setup is frozen only if `ceremony.json`, `init.json` and each
 * genesis are published exactly as the configured texts and sizes describe them.
 */
import { env } from "cloudflare:workers";
import { CEREMONY_LAYOUT, sha256Hex } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import { configureCeremony } from "../../src/actions";
import { freshId, publishedSetup, routedTo, stubOf } from "../support";

/** A fresh ceremony's bindings and object. */
const fresh = () => {
  const name = freshId("actions-setup");
  return { e: { ...env, ...routedTo(name) } as Env, stub: stubOf(name) };
};

const put = (key: string, bytes: Uint8Array | string) =>
  env.PUBLIC.put(key, bytes, {
    sha256: sha256Hex(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes),
  });

describe("configureCeremony", () => {
  it("refuses a setup whose genesis files are missing, of another size or other bytes", async () => {
    const { e, stub } = fresh();
    const setup = await publishedSetup(Date.now() - 1000, Date.now() + 86_400_000);
    const key = CEREMONY_LAYOUT.zkey("shield", 0);
    const original = new Uint8Array(await (await env.PUBLIC.get(key))!.arrayBuffer());
    await env.PUBLIC.delete(key);
    expect(await configureCeremony(e, setup)).toEqual({
      ok: false,
      code: "malformed-setup",
      message: "shield: genesis not published",
    });
    await put(
      key,
      original.map((b) => b ^ 1),
    );
    expect(await configureCeremony(e, setup)).toEqual({
      ok: false,
      code: "malformed-setup",
      message: "shield: published genesis differs from the setup",
    });
    await put(key, original);
    expect(
      await configureCeremony(e, { ...setup, genesisSizes: { ...setup.genesisSizes, shield: 1 } }),
    ).toMatchObject({ ok: false, code: "malformed-setup" });
    expect(await stub.setup()).toBeNull();
    expect(await configureCeremony(e, setup)).toEqual({ ok: true, value: {} });
  });

  it("refuses unless ceremony.json and init.json are published exactly as configured", async () => {
    for (const key of [CEREMONY_LAYOUT.announcement, CEREMONY_LAYOUT.init]) {
      const { e, stub } = fresh();
      // oxlint-disable-next-line no-await-in-loop -- one file at a time
      const setup = await publishedSetup(Date.now() - 1000, Date.now() + 86_400_000);
      // oxlint-disable-next-line no-await-in-loop -- one file at a time
      await put(key, "{}\n");
      // oxlint-disable-next-line no-await-in-loop -- one file at a time
      expect(await configureCeremony(e, setup)).toEqual({
        ok: false,
        code: "malformed-setup",
        message: `published ${key} differs`,
      });
      // oxlint-disable-next-line no-await-in-loop -- one file at a time
      await env.PUBLIC.delete(key);
      // oxlint-disable-next-line no-await-in-loop -- one file at a time
      expect(await configureCeremony(e, setup)).toMatchObject({
        message: `${key} not published`,
      });
      // oxlint-disable-next-line no-await-in-loop -- one file at a time
      expect(await stub.setup()).toBeNull();
    }
  });
});
