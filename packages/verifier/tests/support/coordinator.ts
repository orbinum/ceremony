/**
 * A Node stand-in for the coordinator's side of the verifier protocol: serves one object per job
 * key and collects the reports, both HMAC-checked for `CEREMONY_ID` like the Worker does, and
 * records every request. It can hold object responses (a job in flight), answer report posts with
 * 503 for a while or refuse them with 409 (a final answer), and call back as each authenticated
 * object is served.
 */
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

export const signedDispatch = (body: string, ceremonyId = CEREMONY_ID, key = HMAC_KEY) => ({
  "content-type": "application/json",
  ...signRequest(key, ceremonyId, "POST", "/verify", body, Date.now()),
});

export class FakeCoordinator {
  readonly objects = new Map<string, string>();
  readonly reports: VerifierReport[] = [];
  readonly requests: string[] = [];
  objectDelayMs = 0;
  failReports = 0;
  refuseReports = false;
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

  async reportsAt(n: number, ms = 5_000): Promise<VerifierReport[]> {
    const end = Date.now() + ms;
    while (this.reports.length < n) {
      const left = end - Date.now();
      if (left <= 0) {
        throw new Error(
          `${this.reports.length} of ${n} reports after ${ms} ms; requests:\n${this.requests.join("\n")}`,
        );
      }
      await new Promise<void>((r) => {
        const timer = setTimeout(r, left);
        this.waiters.push(() => (clearTimeout(timer), r()));
      });
    }
    return this.reports;
  }

  fetches = () => this.requests.filter((r) => r.startsWith("GET /internal/objects/"));

  stop = () => new Promise<void>((r) => this.server.close(() => r()));
}
