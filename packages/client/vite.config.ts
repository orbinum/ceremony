import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { TLSSocket } from "node:tls";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

// The coordinator serves the built client from its own origin. In development, the routes it
// answers go to `wrangler dev` (`ORBINUM_DEV_COORDINATOR`, e.g. from the e2e package's `stack`),
// and this dev server's own pages call it as if from its origin (its CSRF check compares
// `Origin`); any other page keeps its `Origin`, so the coordinator refuses it.

/**
 * What the upload claims and the attestation name this client: the repository's version and the
 * commit it was built from (core wants 7–40 hex, so a build outside a git checkout fails here).
 */
export const clientDefines = () => ({
  ORBINUM_CLIENT_VERSION: JSON.stringify(
    (JSON.parse(readFileSync("../../package.json", "utf8")) as { version: string }).version,
  ),
  ORBINUM_CLIENT_COMMIT: JSON.stringify(
    execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim(),
  ),
});

/** Addresses of this machine, as Node reports a client's. */
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export default defineConfig(({ mode }) => {
  // A local run without a GitHub OAuth app: `ORBINUM_DEV_GITHUB_ID` (and `_LOGIN`) in
  // `.env.local` sign every proxied request in as that identity; `wrangler dev` only honours it
  // with `ENVIRONMENT=local` on a loopback host.
  const env = loadEnv(mode, ".", "ORBINUM_DEV_");
  const COORDINATOR = env.ORBINUM_DEV_COORDINATOR ?? "http://localhost:8787";
  const dev: Record<string, string | undefined> = {
    "x-dev-github-id": env.ORBINUM_DEV_GITHUB_ID,
    "x-dev-github-login": env.ORBINUM_DEV_GITHUB_LOGIN,
  };
  const target: ProxyOptions = {
    target: COORDINATOR,
    changeOrigin: true,
    configure: (proxy) =>
      proxy.on("proxyReq", (req, incoming) => {
        // This server's origin, from the Host the browser sent (Vite's allowedHosts check has
        // already refused a foreign Host, as DNS rebinding would send).
        const scheme = (incoming.socket as TLSSocket).encrypted ? "https" : "http";
        if (req.getHeader("origin") === `${scheme}://${incoming.headers.host}`) {
          req.setHeader("origin", COORDINATOR);
        }
        // The browser never chooses the identity, and only this machine gets one: a dev server
        // started with `--host` would otherwise sign any LAN client in (KL-29). A tunnel or
        // reverse proxy in front of this server makes remote visitors look like loopback.
        for (const k of Object.keys(dev)) req.removeHeader(k);
        if (!LOOPBACK.has(incoming.socket.remoteAddress ?? "")) return;
        for (const [k, v] of Object.entries(dev)) if (v) req.setHeader(k, v);
      }),
  };
  return {
    define: clientDefines(),
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    // snarkjs runs in a module worker (`contribution/worker.ts`).
    worker: { format: "es" },
    // No CORS: a page on another local port must not read what the proxy answers.
    server: {
      host: "localhost",
      cors: false,
      proxy: { "/api": target, "/auth": target, "/artifacts": target },
    },
    preview: { host: "localhost", cors: false },
  };
});
