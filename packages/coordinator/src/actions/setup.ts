/**
 * The operator's files and setup (COORDINATOR §3): each setup or final file published once,
 * exactly as declared (final files only once the ceremony is closed, for its own circuits), and
 * the frozen setup, checked against the published files it describes before the object takes it.
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
  parseSetup,
  type Setup,
  type SetupInput,
  setupCircuitOf,
  fromUtf8,
  sha256Hex,
  utf8,
} from "@orbinum-ceremony/core";
import { ceremony } from "../durable";
import { BytesMismatch, getObject, headObject, holds, StorageError, streamExact } from "../storage";
import { fromOutcome, refuse, type Result, succeed } from "./result";

/** A setup or final file as the route validated it. */
export interface PublicFileInput {
  key: string;
  sha256: string;
  size: number;
  body: ReadableStream<Uint8Array>;
}

const IMMUTABLE = (key: string) =>
  refuse("immutable", `${key} is already published with other content`);

/**
 * A per-circuit setup file only for a circuit of the published `init.json`, which `publish-init`
 * uploads first: no file of a circuit the ceremony does not have is ever made public.
 */
async function circuitFileRefusal(env: Env, key: string): Promise<Result<never> | null> {
  const circuit = setupCircuitOf(key);
  if (circuit === null) return null;
  const object = await getObject(env.PUBLIC, CEREMONY_LAYOUT.init);
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

/**
 * Why a file may not be written now: a setup file once the setup is frozen, a final file before
 * the close or for a circuit the ceremony does not have, and anything once it is sealed (FINALIZED is read-only), except a final file
 * with exactly the hash its sealed final record pins: a replacement that raced the handover can
 * then be put right, and nothing else ever can.
 */
async function writeRefusal(env: Env, key: string, sha256: string): Promise<Result<never> | null> {
  const stub = ceremony(env);
  const state = await stub.snapshot();
  if (state?.phase === "FINALIZED") {
    const pinned = finalFiles(await stub.finals()).find((f) => f.key === key);
    return pinned?.sha256 === sha256 ? null : refuse("finalized");
  }
  const setup = await stub.setup();
  // Setup files are published before the setup freezes (an unchanged one was answered already).
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

/** The setup documents, parsed before they are published: one that does not parse never freezes. */
const DOCUMENTS: Record<string, (text: string) => unknown> = {
  [CEREMONY_LAYOUT.announcement]: parseAnnouncement,
  [CEREMONY_LAYOUT.init]: parseInit,
};

/**
 * A setup document's body, read whole (it is small) and parsed: the stream to store, or why not.
 * A file that is not a document passes through.
 */
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

/**
 * Publishes one setup or final file. Published files are immutable: the same bytes again are a
 * no-op (decided without reading the body when the file is already there), other bytes are
 * refused. A final file is the exception until FINALIZED: nothing pins it before the handover, so
 * a wrong one may be replaced instead of making the ceremony unfinalizable.
 */
export async function publishFile(
  env: Env,
  input: PublicFileInput,
): Promise<Result<{ key: string; unchanged?: true }>> {
  const { key, sha256, size } = input;
  const existing = await headObject(env.PUBLIC, key);
  if (existing && holds(existing, sha256)) return succeed({ key, unchanged: true });
  const final = isFinalFileKey(key);
  const replace = existing !== null && final;
  if (existing && !replace) return IMMUTABLE(key);
  // A final file is held before it is judged: finalization waits for it to land.
  const hold = final ? await ceremony(env).holdFinalWrite() : null;
  try {
    const why = await writeRefusal(env, key, sha256);
    if (why) return why;
    const stream = await documentBody(input);
    if (!(stream instanceof ReadableStream)) return stream;
    const r = await streamExact(env.PUBLIC, key, stream, {
      size,
      sha256,
      contentType: contentTypeOf(key),
      ifAbsent: !replace,
      // A replacement lands only over the version just seen: two operators' puts cannot interleave.
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

/**
 * Problems with the published files the setup describes: `ceremony.json` and `init.json` exactly
 * the configured texts, each genesis of the size and hash the setup names, each r1cs of its pinned
 * hash and, outside a local rehearsal, the ptau of its pinned size. Setup files freeze with the
 * setup, so a missing or wrong one could never be put right afterwards.
 */
async function publishedProblems(bucket: R2Bucket, input: SetupInput, setup: Setup) {
  const problems: string[] = [];
  for (const [key, text] of [
    [CEREMONY_LAYOUT.announcement, input.announcement],
    [CEREMONY_LAYOUT.init, input.init],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- two heads
    const object = await headObject(bucket, key);
    if (!object) problems.push(`${key} not published`);
    else if (!holds(object, sha256Hex(utf8(text)))) problems.push(`published ${key} differs`);
  }
  for (const c of setup.init.circuits) {
    // oxlint-disable-next-line no-await-in-loop -- one head per file
    const object = await headObject(bucket, CEREMONY_LAYOUT.zkey(c.name, 0));
    if (!object) problems.push(`${c.name}: genesis not published`);
    else if (object.size !== setup.genesisSizes[c.name] || !holds(object, c.genesis_sha256)) {
      problems.push(`${c.name}: published genesis differs from the setup`);
    }
    // oxlint-disable-next-line no-await-in-loop -- one head per file
    const r1cs = await headObject(bucket, CEREMONY_LAYOUT.r1cs(c.name));
    if (!r1cs) problems.push(`${c.name}: r1cs not published`);
    else if (!holds(r1cs, c.r1cs_sha256)) problems.push(`${c.name}: published r1cs differs`);
  }
  // The ptau is pinned by BLAKE2b-512, which R2 does not check: its size is what is checked here.
  if (setup.announcement.network !== "local") {
    const ptau = await headObject(bucket, CEREMONY_LAYOUT.ptau);
    if (ptau?.size !== setup.init.ptau.size) problems.push("ptau not published at its size");
  }
  return problems;
}

/**
 * The network a deployment runs: a testnet coordinator never freezes a mainnet (or a `local`,
 * check-skipping) ceremony, nor production a testnet one. A local run rehearses any network.
 */
const NETWORK_OF: Record<string, string> = { production: "mainnet", testnet: "testnet" };

/** Freezes the setup, once, if it is valid and describes the published files. */
export async function configureCeremony(env: Env, input: SetupInput): Promise<Result> {
  let setup: Setup;
  try {
    setup = parseSetup(input, env.CEREMONY_ID);
  } catch (error) {
    return refuse("malformed-setup", (error as Error).message);
  }
  const network = NETWORK_OF[env.ENVIRONMENT];
  if (network && setup.announcement.network !== network) {
    return refuse("malformed-setup", `a ${env.ENVIRONMENT} coordinator runs ${network} ceremonies`);
  }
  const problems = await publishedProblems(env.PUBLIC, input, setup);
  if (problems.length > 0) return refuse("malformed-setup", problems.join("; "));
  return fromOutcome(await ceremony(env).configure(input));
}
