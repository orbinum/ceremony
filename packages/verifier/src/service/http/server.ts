/**
 * The verifier's HTTP face (COORDINATOR §5): `POST /verify` takes an HMAC-signed job and answers
 * 202 at once; `GET /healthz` says whether jobs can run. Bounded before a byte of body is read.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  authHeadersWellFormed,
  jobKey,
  type JobSpec,
  MAX_JOB_SPEC_BYTES,
  parseJsonText,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  validateJobSpec,
  VERIFIER_PATHS,
  verifyRequest,
} from "@orbinum-ceremony/core";
import { errorMessage } from "../../text";

/** What the server hands jobs to. */
export interface JobSink {
  /** Queues a job; `false` when the same attempt was already taken. */
  submit(spec: JobSpec): boolean;
  /** Whether the pins hold and the queue is moving. */
  healthy(): boolean;
}

/** Who may dispatch: the shared key, and the ceremony (init.json) every MAC must be bound to. */
export interface DispatchAuth {
  hmacKey: string;
  ceremonyId: string;
}

/**
 * Connection and request bounds: the only client is the coordinator. Every answer but a 202 closes
 * its connection, an idle keep-alive one closes after 1 s, and a socket silent for 5 s (one that
 * never completes a request line, which the header bound does not cover) is dropped: sockets that
 * are not dispatches cannot hold the connection slots for long.
 */
const SERVER_LIMITS = {
  requestTimeoutMs: 10_000,
  headersTimeoutMs: 5_000,
  idleTimeoutMs: 5_000,
  keepAliveTimeoutMs: 1_000,
  maxConnections: 32,
  maxRequestsPerSocket: 100,
} as const;

class TooLarge extends Error {}

/** The body as UTF-8, failing past `MAX_JOB_SPEC_BYTES` whatever the headers said. */
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_JOB_SPEC_BYTES) throw new TooLarge();
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Answers JSON; anything but a 202 closes the connection. */
const reply = (res: ServerResponse, status: number, body: unknown) => {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, {
    "content-type": "application/json",
    ...(status === 202 ? {} : { connection: "close" }),
  });
  res.end(JSON.stringify(body));
};

/** `POST /verify`: header shape and size first, then the body, its MAC and the job spec. */
function dispatch(req: IncomingMessage, res: ServerResponse, auth: DispatchAuth, jobs: JobSink) {
  const timestamp = req.headers[TIMESTAMP_HEADER];
  const signature = req.headers[SIGNATURE_HEADER];
  if (
    typeof timestamp !== "string" ||
    typeof signature !== "string" ||
    !authHeadersWellFormed(timestamp, signature)
  ) {
    return reply(res, 401, { error: "bad signature" });
  }
  const length = req.headers["content-length"];
  if (length !== undefined && !(Number(length) <= MAX_JOB_SPEC_BYTES)) {
    return reply(res, 413, { error: "body too large" });
  }
  readBody(req)
    .then((body) => {
      const headers = { timestamp, signature };
      const { hmacKey, ceremonyId } = auth;
      const path = VERIFIER_PATHS.verify;
      if (!verifyRequest(hmacKey, ceremonyId, "POST", path, body, headers, Date.now())) {
        return reply(res, 401, { error: "bad signature" });
      }
      let spec: JobSpec;
      try {
        spec = validateJobSpec(parseJsonText(body, "job spec"));
      } catch (error) {
        // The answer never quotes the body; the reason stays in this host's log.
        console.error(`dispatch refused: ${errorMessage(error)}`);
        return reply(res, 400, { error: "invalid job spec" });
      }
      // A repeated dispatch of the same attempt is acknowledged, not run twice.
      jobs.submit(spec);
      return reply(res, 202, { accepted: jobKey(spec.job) });
    })
    .catch((error: unknown) =>
      error instanceof TooLarge
        ? reply(res, 413, { error: "body too large" })
        : reply(res, 400, { error: "unreadable body" }),
    );
}

/** The service's HTTP server; jobs go to `jobs`, which runs them. */
export function createVerifierServer(auth: DispatchAuth, jobs: JobSink): Server {
  const server = createServer(
    {
      requestTimeout: SERVER_LIMITS.requestTimeoutMs,
      headersTimeout: SERVER_LIMITS.headersTimeoutMs,
      // How often the two timeouts above are enforced (default 30 s).
      connectionsCheckingInterval: 1_000,
    },
    (req, res) => {
      if (req.method === "GET" && req.url === "/healthz") {
        const ok = jobs.healthy();
        return reply(res, ok ? 200 : 503, { ok });
      }
      if (req.method === "POST" && req.url === VERIFIER_PATHS.verify) {
        return dispatch(req, res, auth, jobs);
      }
      return reply(res, 404, { error: "not found" });
    },
  );
  server.keepAliveTimeout = SERVER_LIMITS.keepAliveTimeoutMs;
  server.timeout = SERVER_LIMITS.idleTimeoutMs;
  server.maxConnections = SERVER_LIMITS.maxConnections;
  server.maxRequestsPerSocket = SERVER_LIMITS.maxRequestsPerSocket;
  return server;
}
