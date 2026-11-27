/**
 * A request's body bytes, failing with `TooLarge` past `MAX_JOB_SPEC_BYTES` whatever the headers
 * said.
 */
import type { IncomingMessage } from "node:http";
import { MAX_JOB_SPEC_BYTES } from "@orbinum-ceremony/core";
import { TooLarge } from "./too-large";

export async function readBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_JOB_SPEC_BYTES) throw new TooLarge();
    chunks.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
