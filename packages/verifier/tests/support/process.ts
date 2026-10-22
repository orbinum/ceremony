/**
 * The verifier service as its own process (`node --import tsx src/service/main.ts`), as it is
 * deployed: node itself gets the signals, with no `tsx` CLI in between to relay (and, under load,
 * SIGKILL) them.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE = join(import.meta.dirname, "..", "..");
const MAIN = join(PACKAGE, "src", "service", "main.ts");
// Absolute, so the service also starts from another working directory.
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

/** How a service process ended. */
export type Exit = { code: number | null; signal: NodeJS.Signals | null };

/** A started service: its process, what it printed, and its exit. */
export interface ServiceProcess {
  child: ChildProcess;
  output: () => string;
  exited: Promise<Exit>;
}

/** Spawns the service with exactly `env` (plus `PATH`), from `cwd` (the package by default). */
export function spawnService(env: Record<string, string>, cwd = PACKAGE): ServiceProcess {
  const child = spawn(process.execPath, ["--import", TSX_LOADER, MAIN], {
    cwd,
    env: { PATH: process.env.PATH ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
  child.stderr?.on("data", (d: Buffer) => (out += d.toString()));
  const exited = new Promise<Exit>((r) =>
    child.once("exit", (code, signal) => r({ code, signal })),
  );
  return { child, output: () => out, exited };
}

/** The service's exit, or a failure naming what it printed if it is still running after `ms`. */
export async function exitWithin(service: ServiceProcess, ms = 15_000): Promise<Exit> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`the service did not exit within ${ms} ms:\n${service.output()}`)),
      ms,
    );
  });
  try {
    return await Promise.race([service.exited, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves once `GET <url>/healthz` answers 200; throws with the service's output otherwise. */
export async function waitHealthy(
  url: string,
  service: ServiceProcess,
  ms = 60_000,
): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end && service.child.exitCode === null) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- polls until the server is up
      if ((await fetch(`${url}/healthz`)).status === 200) return;
    } catch {
      // not listening yet
    }
    // oxlint-disable-next-line no-await-in-loop -- polls until the server is up
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`the verifier service did not start:\n${service.output()}`);
}

/** A free local TCP port. */
export const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
