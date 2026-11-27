/**
 * Publishes one setup or final file, exactly as declared. Published files are immutable: the same
 * bytes again are a no-op (decided without reading the body when the file is already there), other
 * bytes are refused. A setup file is taken only before the setup freezes, and a per-circuit one only
 * for a circuit of the published `init.json`, so no file of a circuit the ceremony lacks is ever
 * public; a setup document must parse before it is stored. A final file is taken only once the
 * ceremony is closed with its last verification settled, for its own circuits, and may be replaced
 * until FINALIZED (nothing pins it before the handover, so a wrong one must not make the ceremony
 * unfinalizable); a replacement lands only over the version just seen, so two operators' writes
 * cannot interleave. Once sealed, only a final file with exactly the hash its final record pins is
 * taken, so one that raced the handover can be put right and nothing else can. A final file holds
 * finalization off before it is judged, until it lands.
 */
import {
  CEREMONY_LAYOUT,
  contentTypeOf,
  finalCircuitOf,
  finalFiles,
  type InitRecord,
  isFinalFileKey,
  MAX_DOCUMENT_BYTES,
  parseAnnouncement,
  parseInit,
  setupCircuitOf,
  fromUtf8,
  sha256Hex,
} from "@orbinum-ceremony/core";
import { ceremony } from "../../durable";
import {
  BytesMismatch,
  getObject,
  headObject,
  holds,
  publicBucket,
  StorageError,
  streamExact,
} from "../../storage";
import { refuse, succeed } from "../result";
import type { Result } from "../types";

export interface PublicFileInput {
  key: string;
  sha256: string;
  size: number;
  body: ReadableStream<Uint8Array>;
}

const IMMUTABLE = (key: string) =>
  refuse("immutable", `${key} is already published with other content`);

async function circuitFileRefusal(env: Env, key: string): Promise<Result<never> | null> {
  const circuit = setupCircuitOf(key);
  if (circuit === null) return null;
  const object = await getObject(publicBucket(env), CEREMONY_LAYOUT.init);
  if (!object) return refuse("invalid-transition", `publish ${CEREMONY_LAYOUT.init} first`);
  if (object.size > MAX_DOCUMENT_BYTES) {
    await object.body.cancel();
    return refuse("malformed", `the published ${CEREMONY_LAYOUT.init} is not valid`);
  }
  let init: InitRecord;
  try {
    init = parseInit(await object.text());
  } catch {
    return refuse("malformed", `the published ${CEREMONY_LAYOUT.init} is not valid`);
  }
  return init.circuits.some((c) => c.name === circuit)
    ? null
    : refuse("malformed", `${key}: not a circuit of ${CEREMONY_LAYOUT.init}`);
}

async function writeRefusal(env: Env, key: string, sha256: string): Promise<Result<never> | null> {
  const stub = ceremony(env);
  const state = await stub.snapshot();
  if (state?.phase === "FINALIZED") {
    const pinned = finalFiles(await stub.finals()).find((f) => f.key === key);
    return pinned?.sha256 === sha256 ? null : refuse("finalized");
  }
  const setup = await stub.setup();
  if (!isFinalFileKey(key)) {
    if (setup) return refuse("invalid-transition", "setup files are frozen once configured");
    return circuitFileRefusal(env, key);
  }
  if (!setup || !state) return refuse("not-configured");
  if (state.phase !== "CLOSED" || state.slot !== null) {
    return refuse(
      "invalid-transition",
      "final files are accepted once the ceremony is closed and its last verification settled",
    );
  }
  if (!setup.init.circuits.some((c) => c.name === finalCircuitOf(key))) {
    return refuse("malformed", `${key}: not a circuit of this ceremony`);
  }
  return null;
}

const DOCUMENTS: Record<string, (text: string) => unknown> = {
  [CEREMONY_LAYOUT.announcement]: parseAnnouncement,
  [CEREMONY_LAYOUT.init]: parseInit,
};

async function documentBody(
  input: PublicFileInput,
): Promise<Result<never> | ReadableStream<Uint8Array>> {
  const parse = DOCUMENTS[input.key];
  if (!parse) return input.body;
  if (input.size > MAX_DOCUMENT_BYTES) {
    await input.body.cancel();
    return refuse("malformed", `${input.key} is larger than ${MAX_DOCUMENT_BYTES} bytes`);
  }
  const bounded = input.body.pipeThrough(new FixedLengthStream(input.size));
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await new Response(bounded).arrayBuffer());
  } catch {
    return refuse("malformed", "the body does not match its Content-Length or SHA-256");
  }
  if (sha256Hex(bytes) !== input.sha256) {
    return refuse("malformed", "the body does not match its Content-Length or SHA-256");
  }
  try {
    parse(fromUtf8(bytes));
  } catch {
    return refuse("malformed", `${input.key} is not a valid document`);
  }
  return new Response(bytes).body as ReadableStream<Uint8Array>;
}

export async function publishFile(
  env: Env,
  input: PublicFileInput,
): Promise<Result<{ key: string; unchanged?: true }>> {
  const { key, sha256, size } = input;
  const existing = await headObject(publicBucket(env), key);
  if (existing && holds(existing, sha256)) return succeed({ key, unchanged: true });
  const final = isFinalFileKey(key);
  const replace = existing !== null && final;
  if (existing && !replace) return IMMUTABLE(key);
  const hold = final ? await ceremony(env).holdFinalWrite() : null;
  try {
    const why = await writeRefusal(env, key, sha256);
    if (why) return why;
    const stream = await documentBody(input);
    if (!(stream instanceof ReadableStream)) return stream;
    const r = await streamExact(publicBucket(env), key, stream, {
      size,
      sha256,
      contentType: contentTypeOf(key),
      ifAbsent: !replace,
      ...(replace && existing ? { ifEtag: existing.etag } : {}),
    });
    if (r === "conflict") return IMMUTABLE(key);
    return r === "stored" ? succeed({ key }, 201) : succeed({ key, unchanged: true });
  } catch (error) {
    if (error instanceof BytesMismatch) {
      return refuse("malformed", "the body does not match its Content-Length or SHA-256");
    }
    if (error instanceof StorageError) {
      console.error(error);
      return refuse("storage", "the file could not be stored; try again");
    }
    throw error;
  } finally {
    if (hold !== null) await ceremony(env).releaseFinalWrite(hold);
  }
}
