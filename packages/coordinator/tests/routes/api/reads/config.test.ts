/** `GET /api/config`: the deployment's network and Turnstile site key, for one client build. */
import { describe, expect, it } from "vitest";
import { appWith, json } from "../../../support";

const get = (patch: Partial<Env>, base: string) =>
  appWith(patch, `${base}/api/config`, { headers: { "cf-connecting-ip": "10.90.0.1" } });

describe("GET /api/config", () => {
  it("names the network and hands out the site key, but none to a local run", async () => {
    const testnet = await get(
      { ENVIRONMENT: "testnet", TURNSTILE_SITE_KEY: "0xsite" },
      "https://testnet.ceremony.example",
    );
    expect(await json(testnet)).toEqual({ network: "testnet", turnstileSiteKey: "0xsite" });
    const mainnet = await get(
      { ENVIRONMENT: "production", TURNSTILE_SITE_KEY: "" },
      "https://ceremony.example",
    );
    expect(await json(mainnet)).toEqual({ network: "mainnet", turnstileSiteKey: null });
    const local = await get({ TURNSTILE_SITE_KEY: "0xsite" }, "http://localhost");
    expect(await json(local)).toEqual({ network: "local", turnstileSiteKey: null });
  });
});
