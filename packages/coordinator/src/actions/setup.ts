/**
 * The operator's files and setup (COORDINATOR §3): each setup or final file published once,
 * exactly as declared (final files only once the ceremony is closed, for its own circuits), and
 * the frozen setup, checked against the published files it describes before the object takes it.
 */
import {
  CEREMONY_LAYOUT,
  CIRCUIT_ORDER,
  contentTypeOf,
  finalFiles,
  isFinalFileKey,
  parseSetup,
  type Setup,
  type SetupInput,
  sha256Hex,
  utf8,
} from "@orbinum-ceremony/core";
import { ceremony } from "../durable";
import { BytesMismatch, headObject, holds, StorageError, streamExact } from "../storage";
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

/** The circuit a final file belongs to. */
const finalCircuitOf = (key: string) =>
  CIRCUIT_ORDER.find(
    (c) => key === CEREMONY_LAYOUT.finalZkey(c) || key === CEREMONY_LAYOUT.finalVk(c),
  );

/**
 * Why a file may not be written now: a final file before the close or for a circuit the ceremony
 * does not have, and anything once it is sealed (FINALIZED is read-only), except a final file
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
  if (!isFinalFileKey(key)) return null;
  const setup = await stub.setup();
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
  const { key, sha256, size, body } = input;
  const existing = await headObject(env.PUBLIC, key);
  if (existing && holds(existing, sha256)) return succeed({ key, unchanged: true });
  const replace = existing !== null && isFinalFileKey(key);
  if (existing && !replace) return IMMUTABLE(key);
  const why = await writeRefusal(env, key, sha256);
  if (why) return why;
  try {
    const r = await streamExact(env.PUBLIC, key, body, {
      size,
      sha256,
      contentType: contentTypeOf(key),
      ifAbsent: !replace,
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
  }
}

/**
 * Problems with the published files the setup describes: `ceremony.json` and `init.json` exactly
 * the configured texts, and each genesis of the size and hash the setup names.
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
    // oxlint-disable-next-line no-await-in-loop -- three heads
    const object = await headObject(bucket, CEREMONY_LAYOUT.zkey(c.name, 0));
    if (!object) problems.push(`${c.name}: genesis not published`);
    else if (object.size !== setup.genesisSizes[c.name] || !holds(object, c.genesis_sha256)) {
      problems.push(`${c.name}: published genesis differs from the setup`);
    }
  }
  return problems;
}

/** Freezes the setup, once, if it is valid and describes the published files. */
export async function configureCeremony(env: Env, input: SetupInput): Promise<Result> {
  let setup: Setup;
  try {
    setup = parseSetup(input, env.CEREMONY_ID);
  } catch (error) {
    return refuse("malformed-setup", (error as Error).message);
  }
  const problems = await publishedProblems(env.PUBLIC, input, setup);
  if (problems.length > 0) return refuse("malformed-setup", problems.join("; "));
  return fromOutcome(await ceremony(env).configure(input));
}
