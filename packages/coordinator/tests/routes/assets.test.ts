/**
 * The client is served as static assets, and any unknown path gets its page (a single-page app):
 * every route group the Worker mounts must be listed in `run_worker_first`, or its requests would
 * get the page instead of the Worker. `/archive` itself is the client's page; only the files below it
 * are the Worker's.
 */
import { describe, expect, it } from "vitest";

const [config] = Object.values(
  import.meta.glob<string>("../../wrangler.jsonc", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);
const [routes] = Object.values(
  import.meta.glob<string>("../../src/routes/routes.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

const workerFirst = (): string[] => {
  const list = /"run_worker_first":\s*\[([^\]]*)\]/.exec(config ?? "")?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
};

describe("run_worker_first", () => {
  it("sends every mounted route group to the Worker, the bare path and below it", () => {
    const mounted = [...(routes ?? "").matchAll(/\.route\("([^"]+)"/g)].map((m) => m[1]);
    expect(mounted).toContain("/archive");
    const first = workerFirst();
    for (const prefix of mounted) expect(first).toContain(`${prefix}/*`);
    expect(first).not.toContain("/archive");
  });
});
