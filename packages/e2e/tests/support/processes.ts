/**
 * The two services of the stack as their own processes: `wrangler dev` (the coordinator) and the
 * verifier service. Each gets an explicit, minimal environment (PATH, HOME, TMPDIR, LANG; no
 * operator secrets), runs in its own process group, is stopped with SIGTERM then SIGKILL, and a
 * child that exits during startup fails at once. wrangler gets an explicit devtools port: left to
 * itself, two stacks starting at once both take 9229 and one fails to bind. It also refuses a
 * missing assets directory, so without a client build a placeholder page keeps the single-page
 * fallback (any unknown path is the page) as deployed.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const COORDINATOR_DIR = join(import.meta.dirname, "..", "..", "..", "coordinator");
const WRANGLER = join(COORDINATOR_DIR, "node_modules", ".bin", "wrangler");
const VERIFIER_MAIN = join(COORDINATOR_DIR, "..", "verifier", "src", "service", "main.ts");

const baseEnv = (): Record<string, string> =>
  Object.fromEntries(
    ["PATH", "HOME", "TMPDIR", "LANG"].flatMap((k) => {
      const v = process.env[k];
      return v === undefined ? [] : [[k, v]];
    }),
  );

export interface Service {
  url: string;
  process: ChildProcess;
  stderr(): string;
  stop(graceMs?: number): Promise<void>;
}

async function startService(
  cmd: string,
  args: string[],
  opts: {
    cwd: string;
    env: Record<string, string>;
    url: string;
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
    } catch {}
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
      if (opts.up((await fetch(`${opts.url}${opts.ready}`)).status)) return service;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop(1_000);
  throw new Error(`${opts.what} did not start:\n${stderr}`);
}

export const startCoordinator = (opts: {
  port: number;
  inspectorPort: number;
  persist: string;
  envFile: string;
  vars: Record<string, string>;
}): Promise<Service> => {
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
      ready: "/api/status",
      up: () => true,
      what: "wrangler dev",
    },
  );
};

export const startVerifier = (env: Record<string, string>): Promise<Service> =>
  startService(process.execPath, ["--import", "tsx", VERIFIER_MAIN], {
    cwd: join(VERIFIER_MAIN, "..", "..", ".."),
    env: { ...baseEnv(), HOST: "127.0.0.1", ...env },
    url: `http://127.0.0.1:${env.PORT}`,
    ready: "/healthz",
    up: (status) => status === 200,
    what: "the verifier service",
  });
