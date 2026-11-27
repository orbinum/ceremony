/**
 * `POST /verify`: the MAC first, which covers the body's digest, so an unauthenticated request is
 * refused before a byte of body is read; then a replay inside the freshness window is refused, then
 * the size, then the body against its digest and the job spec. A repeated header counts as absent.
 * The answer never quotes the body: why a spec was refused stays in this host's log. A repeated
 * dispatch of the same attempt is acknowledged, not run twice.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  bodyMatches,
  fromUtf8,
  jobKey,
  type JobSpec,
  MAX_JOB_SPEC_BYTES,
  parseJsonText,
  requestAuthOf,
  validateJobSpec,
  VERIFIER_PATHS,
  verifyRequestHeaders,
} from "@orbinum-ceremony/core";
import { errorMessage } from "../../text";
import { readBody } from "./read-body";
import { replyJson } from "./reply-json";
import type { spentMacs } from "./spent-macs";
import { TooLarge } from "./too-large";
import type { DispatchAuth, JobSink } from "./types";

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export function handleDispatch(
  req: IncomingMessage,
  res: ServerResponse,
  auth: DispatchAuth,
  jobs: JobSink,
  spend: ReturnType<typeof spentMacs>,
) {
  const headers = requestAuthOf((name) => one(req.headers[name]));
  const { hmacKey, ceremonyId } = auth;
  const now = Date.now();
  if (!verifyRequestHeaders(hmacKey, ceremonyId, "POST", VERIFIER_PATHS.verify, headers, now)) {
    return replyJson(res, 401, { error: "bad signature" });
  }
  if (!spend(headers.signature as string, Number(headers.timestamp), now)) {
    return replyJson(res, 401, { error: "replayed request" });
  }
  const length = req.headers["content-length"];
  if (length !== undefined && !(Number(length) <= MAX_JOB_SPEC_BYTES)) {
    return replyJson(res, 413, { error: "body too large" });
  }
  readBody(req)
    .then((bytes) => {
      if (!bodyMatches(bytes, headers)) return replyJson(res, 401, { error: "bad signature" });
      const body = fromUtf8(bytes);
      let spec: JobSpec;
      try {
        spec = validateJobSpec(parseJsonText(body, "job spec"));
      } catch (error) {
        console.error(`dispatch refused: ${errorMessage(error)}`);
        return replyJson(res, 400, { error: "invalid job spec" });
      }
      const submitted = jobs.submit(spec);
      if (submitted === "conflict") {
        console.error(`dispatch refused: ${jobKey(spec.job)} was dispatched with another spec`);
        return replyJson(res, 409, { error: "conflicting dispatch" });
      }
      if (submitted === "full") return replyJson(res, 503, { error: "busy" });
      return replyJson(res, 202, { accepted: jobKey(spec.job) });
    })
    .catch((error: unknown) =>
      error instanceof TooLarge
        ? replyJson(res, 413, { error: "body too large" })
        : replyJson(res, 400, { error: "unreadable body" }),
    );
}
