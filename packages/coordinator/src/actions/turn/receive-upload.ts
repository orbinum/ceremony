/**
 * Receiving an upload: the Durable Object checks it before a byte moves, the body is streamed to
 * the private bucket only if it is exactly the declared bytes hashing to the claimed output, the
 * object checks it again, and the job goes to the verifier (kept alive past the answer by
 * `waitUntil`). The claimed method must be the credential's: a CLI token uploads as `cli`, the
 * browser as `browser` (a local run's development header may claim either). The private object
 * never survives a refusal.
 */
import type { CircuitName, ContributionClaim, JobId } from "@orbinum-ceremony/core";
import { ceremony } from "../../durable";
import { dispatch } from "../../services";
import {
  BytesMismatch,
  deleteQuietly,
  privateBucket,
  StorageError,
  streamExact,
} from "../../storage";
import { refuse, succeed } from "../result";
import type { Result } from "../types";

export interface UploadInput {
  githubId: number;
  via: "session" | "cli" | "dev";
  circuit: CircuitName;
  claim: ContributionClaim;
  size: number;
  body: ReadableStream<Uint8Array>;
}

export async function receiveUpload(
  env: Env,
  input: UploadInput,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<Result<{ job: JobId & { index: number } }>> {
  const { body, via, ...rest } = input;
  if (via !== "dev" && rest.claim.method !== (via === "cli" ? "cli" : "browser")) {
    return refuse(
      "malformed",
      `an upload with this credential claims method "${via === "cli" ? "cli" : "browser"}"`,
    );
  }
  const request = {
    githubId: rest.githubId,
    circuit: rest.circuit,
    claim: rest.claim,
    size: rest.size,
  };
  const stub = ceremony(env);
  const prepared = await stub.prepareUpload(request);
  if (!prepared.ok) return refuse(prepared.refusal);
  try {
    await streamExact(privateBucket(env), prepared.key, body, {
      size: input.size,
      sha256: input.claim.outputSha256,
      contentType: "application/octet-stream",
      ifAbsent: true,
    });
  } catch (error) {
    await deleteQuietly(privateBucket(env), prepared.key);
    await stub.releaseUpload(prepared.key).catch(() => undefined);
    if (error instanceof BytesMismatch) {
      return refuse("malformed", "the body does not match its Content-Length or output hash");
    }
    if (error instanceof StorageError) {
      console.error(error);
      return refuse("storage", "the upload could not be stored; try again");
    }
    throw error;
  }
  const uploaded = await stub.uploaded(request, prepared.key);
  if (!uploaded.ok) {
    await deleteQuietly(privateBucket(env), prepared.key);
    return refuse(uploaded.refusal);
  }
  waitUntil(dispatch(env, uploaded.spec));
  return succeed({ job: uploaded.spec.job }, 202);
}
