/**
 * The two services of the stack as their own processes: `wrangler dev` (the coordinator) and the
 * verifier service. Each gets an explicit, minimal environment (no operator secrets), is stopped
 * with SIGTERM then SIGKILL, and a child that exits during startup fails at once.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { join } from "node:path";

/** The coordinator package: its wrangler.jsonc and its local wrangler binary. */
export const COORDINATOR_DIR = join(import.meta.dirname, "..", "..", "..", "coordinator");
const WRANGLER = join(COORDINATOR_DIR, "node_modules", ".bin", "wrangler");
const VERIFIER_MAIN = join(COORDINATOR_DIR, "..", "verifier", "src", "service", "main.ts");

/** What a service inherits from the test's environment: enough to run, nothing secret. */
const baseEnv = (): Record<string, string> =>
  Object.fromEntries(
    ["PATH", "HOME", "TMPDIR", "LANG"].flatMap((k) => {
      const v = process.env[k];
      return v === undefined ? [] : [[k, v]];
    }),
  );

/**
 * `n` distinct free local TCP ports: every listener is open at once before any is closed, so two
 * calls in one run never return the same port.
 */
export async function freePorts(n: number): Promise<number[]> {
  const servers: Server[] = [];
  const ports: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = createServer();
    // oxlint-disable-next-line no-await-in-loop -- listeners must overlap
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    servers.push(s);
    ports.push((s.address() as { port: number }).port);
  }
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  return ports;
}

/** A running service and how to stop it. */
export interface Service {
  url: string;
  process: ChildProcess;
  /** Everything it wrote to stderr so far (for a failure message). */
  stderr(): string;
  /** SIGTERM to its process group, then SIGKILL after `graceMs`; resolves once it exited. */
  stop(graceMs?: number): Promise<void>;
}

/** Spawns `cmd` in its own process group with `env`, and polls `ready` until it answers. */
async function startService(
  cmd: string,
  args: string[],
  opts: {
    cwd: string;
    env: Record<string, string>;
    url: string;
    /** The path polled, and which answer means "up". */
    ready: string;
    up: (status: number) => boolean;
    what: string;
  },
): Promise<Service> {
  const child = spawn(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["ignore", "inherit", "pipe"],
    detached: true,
  });
  let stderr = "";
  child.stderr?.on("data", (d: Buffer) => {
    stderr += d.toString();
    process.stderr.write(d);
  });
  const exited = new Promise<void>((r) => child.once("exit", () => r()));
  const running = () => child.exitCode === null && child.signalCode === null;
  const signal = (s: NodeJS.Signals) => {
    try {
      process.kill(-(child.pid as number), s);
    } catch {
      // already gone
    }
  };
  const stop = async (graceMs = 10_000) => {
    if (!running()) return;
    signal("SIGTERM");
    const timer = setTimeout(() => signal("SIGKILL"), graceMs);
    await exited;
    clearTimeout(timer);
  };
  const service = { url: opts.url, process: child, stderr: () => stderr, stop };
  for (let i = 0; i < 240 && running(); i++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- polls until the service is up
      if (opts.up((await fetch(`${opts.url}${opts.ready}`)).status)) return service;
    } catch {
      // not listening yet
    }
    // oxlint-disable-next-line no-await-in-loop -- polls until the service is up
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop(1_000);
  throw new Error(`${opts.what} did not start:\n${stderr}`);
}

/**
 * `wrangler dev` of the coordinator with local R2 and Durable Object storage. The devtools port is
 * given too: left to wrangler, two stacks starting at once both take 9229 and one fails to bind.
 */
export const startCoordinator = (opts: {
  port: number;
  inspectorPort: number;
  persist: string;
  envFile: string;
  vars: Record<string, string>;
}): Promise<Service> => {
  // wrangler refuses a missing assets directory. Without a client build, a placeholder page keeps
  // the single-page fallback (any unknown path is the page) as it is deployed.
  const dist = join(COORDINATOR_DIR, "..", "client", "dist");
  mkdirSync(dist, { recursive: true });
  if (!existsSync(join(dist, "index.html"))) {
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>e2e</title>\n");
  }
  return startService(
    WRANGLER,
    [
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      String(opts.port),
      "--inspector-port",
      String(opts.inspectorPort),
      "--persist-to",
      opts.persist,
      "--env-file",
      opts.envFile,
      "--show-interactive-dev-session=false",
      "--log-level",
      "warn",
      ...Object.entries(opts.vars).flatMap(([k, v]) => ["--var", `${k}:${v}`]),
    ],
    {
      cwd: COORDINATOR_DIR,
      env: { ...baseEnv(), WRANGLER_SEND_METRICS: "false" },
      url: `http://127.0.0.1:${opts.port}`,
      // Any answer: before the setup is configured, the status is a 503.
      ready: "/api/status",
      up: () => true,
      what: "wrangler dev",
    },
  );
};

/**
 * The verifier service as deployed (`node --import tsx src/service/main.ts`, configured by its
 * environment);
 * resolves once `/healthz` answers.
 */
export const startVerifier = (env: Record<string, string>): Promise<Service> =>
  startService(process.execPath, ["--import", "tsx", VERIFIER_MAIN], {
    cwd: join(VERIFIER_MAIN, "..", "..", ".."),
    env: { ...baseEnv(), HOST: "127.0.0.1", ...env },
    url: `http://127.0.0.1:${env.PORT}`,
    ready: "/healthz",
    up: (status) => status === 200,
    what: "the verifier service",
  });
