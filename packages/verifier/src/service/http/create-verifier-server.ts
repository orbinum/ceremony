/**
 * The verifier's HTTP face: `POST /verify` takes an HMAC-signed job and answers 202 at once;
 * `GET /healthz` says whether jobs can run. The only client is the coordinator, so connections are
 * tightly bounded: every answer but a 202 closes its connection, an idle keep-alive one closes
 * after 1 s, and a socket silent for 5 s (one that never completes a request line, which the header
 * bound does not cover) is dropped, so sockets that are not dispatches cannot hold the connection
 * slots for long. The request and header timeouts are enforced every second (Node's default is
 * 30 s).
 */
import { createServer, type Server } from "node:http";
import { VERIFIER_PATHS } from "@orbinum-ceremony/core";
import { handleDispatch } from "./handle-dispatch";
import { replyJson } from "./reply-json";
import { spentMacs } from "./spent-macs";
import type { DispatchAuth, JobSink } from "./types";

const SERVER_LIMITS = {
  requestTimeoutMs: 10_000,
  headersTimeoutMs: 5_000,
  idleTimeoutMs: 5_000,
  keepAliveTimeoutMs: 1_000,
  maxConnections: 32,
  maxRequestsPerSocket: 100,
} as const;

export function createVerifierServer(auth: DispatchAuth, jobs: JobSink): Server {
  const spend = spentMacs();
  const server = createServer(
    {
      requestTimeout: SERVER_LIMITS.requestTimeoutMs,
      headersTimeout: SERVER_LIMITS.headersTimeoutMs,
      connectionsCheckingInterval: 1_000,
    },
    (req, res) => {
      if (req.method === "GET" && req.url === "/healthz") {
        const ok = jobs.healthy();
        return replyJson(res, ok ? 200 : 503, { ok });
      }
      if (req.method === "POST" && req.url === VERIFIER_PATHS.verify) {
        return handleDispatch(req, res, auth, jobs, spend);
      }
      return replyJson(res, 404, { error: "not found" });
    },
  );
  server.keepAliveTimeout = SERVER_LIMITS.keepAliveTimeoutMs;
  server.timeout = SERVER_LIMITS.idleTimeoutMs;
  server.maxConnections = SERVER_LIMITS.maxConnections;
  server.maxRequestsPerSocket = SERVER_LIMITS.maxRequestsPerSocket;
  return server;
}
