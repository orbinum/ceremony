/** A Node stand-in for the coordinator's side of the verifier protocol (COORDINATOR §5). */
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import {
  INTERNAL_PATHS,
  type JobSpec,
  requestAuthOf,
  signRequest,
  validateReport,
  type VerifierReport,
  verifyRequest,
} from "@orbinum-ceremony/core";
import { CEREMONY_ID } from "./ceremony";

export const HMAC_KEY = "test-verifier-key-of-32-bytes-or-more";

const CLIENT = { name: "test", version: "0.0.0", commit: "abc1234" };

/** A job for the first contribution to `shield` over a genesis pinned as `genesisSha256`. */
export const jobSpec = (
  attempt: number,
  genesis: { sha256: string; csHash: string },
  over: {
    size?: number;
    outputSha256?: string;
    contributionHash?: string;
    inputSha256?: string;
  } = {},
): JobSpec => ({
  job: { seq: 1, circuit: "shield", attempt, index: 1 },
  claim: {
    inputSha256: over.inputSha256 ?? genesis.sha256,
    outputSha256: over.outputSha256 ?? "22".repeat(32),
    contributionHash: over.contributionHash ?? "00".repeat(64),
    method: "cli",
    client: CLIENT,
  },
  size: over.size ?? 10,
  head: { outputSha256: genesis.sha256, csHash: genesis.csHash, previous: [] },
  genesisSha256: genesis.sha256,
});

/** The headers of a dispatch of `body`, as the coordinator signs it (time read when called). */
export const signedDispatch = (body: string, ceremonyId = CEREMONY_ID, key = HMAC_KEY) => ({
  "content-type": "application/json",
  ...signRequest(key, ceremonyId, "POST", "/verify", body, Date.now()),
});

/**
 * The coordinator's side of the protocol: serves one object per job key and collects the reports,
 * both HMAC-checked for `CEREMONY_ID` like the Worker does; records every request it gets.
 */
export class FakeCoordinator {
  readonly objects = new Map<string, string>();
  readonly reports: VerifierReport[] = [];
  readonly requests: string[] = [];
  /** Holds each object response this long (a job in flight). */
  objectDelayMs = 0;
  /** Answers this many report posts with 503 before taking one. */
  failReports = 0;
  /** Refuses every report post with 409 (a final answer). */
  refuseReports = false;
  /** Called as each object is served, after its request was authenticated. */
  onObject: (() => void) | undefined;
  private waiters: (() => void)[] = [];
  private server!: Server;
  url = "";

  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = Buffer.concat(chunks).toString("utf8");
      const path = req.url ?? "";
      this.requests.push(`${req.method} ${path}`);
      const ok = verifyRequest(
        HMAC_KEY,
        CEREMONY_ID,
        req.method ?? "",
        path,
        body,
        requestAuthOf((name) => req.headers[name] as string | undefined),
        Date.now(),
      );
      if (!ok) return res.writeHead(401).end();
      if (req.method === "GET" && path.startsWith("/internal/objects/")) {
        const file = this.objects.get(path.slice("/internal/objects/".length));
        if (!file) return res.writeHead(404).end();
        const bytes = await readFile(file);
        await new Promise((r) => setTimeout(r, this.objectDelayMs));
        this.onObject?.();
        return res.writeHead(200, { "content-length": bytes.length }).end(bytes);
      }
      if (req.method === "POST" && path === INTERNAL_PATHS.verifications) {
        if (this.refuseReports) return res.writeHead(409).end('{"error":"stale"}');
        if (this.failReports > 0) {
          this.failReports -= 1;
          return res.writeHead(503).end("busy");
        }
        this.reports.push(validateReport(JSON.parse(body)));
        for (const w of this.waiters.splice(0)) w();
        return res.writeHead(200).end("{}");
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  /** Resolves once `n` reports have arrived; fails after `ms` listing the requests seen. */
  async reportsAt(n: number, ms = 5_000): Promise<VerifierReport[]> {
    const end = Date.now() + ms;
    while (this.reports.length < n) {
      const left = end - Date.now();
      if (left <= 0) {
        throw new Error(
          `${this.reports.length} of ${n} reports after ${ms} ms; requests:\n${this.requests.join("\n")}`,
        );
      }
      // oxlint-disable-next-line no-await-in-loop -- waits for the next callback, bounded
      await new Promise<void>((r) => {
        const timer = setTimeout(r, left);
        this.waiters.push(() => (clearTimeout(timer), r()));
      });
    }
    return this.reports;
  }

  /** Object fetches seen so far. */
  fetches = () => this.requests.filter((r) => r.startsWith("GET /internal/objects/"));

  stop = () => new Promise<void>((r) => this.server.close(() => r()));
}
