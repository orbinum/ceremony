import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/** Tests run inside workerd with the Worker's own wrangler.jsonc (bindings, Durable Object). */
export default defineConfig({
  // The first request of a file loads the Worker cold (ethers, the sr25519 WASM): seconds.
  test: { testTimeout: 30_000 },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Test-only secrets and the OAuth app id; never real values.
      miniflare: {
        bindings: {
          ENVIRONMENT: "local",
          PUBLIC_CACHE_SECONDS: "0",
          SESSION_KEY: "test-session-key-of-32-bytes-or-more",
          GITHUB_CLIENT_SECRET: "test-client-secret",
          VERIFIER_HMAC_KEY: "test-verifier-key-of-32-bytes-or-more",
          TURNSTILE_SECRET: "test-turnstile-secret",
          GITHUB_CLIENT_ID: "test-client-id",
        },
      },
    }),
  ],
});
