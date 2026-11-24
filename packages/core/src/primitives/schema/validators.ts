/**
 * Field validators for every document the ceremony reads from outside. Each returns the
 * validated value or throws `FormatError` naming the field path.
 */
import { FormatError } from "../errors";
import { CEREMONY_ID, CIRCUIT_NAME, COMMIT, isCircuitName } from "./patterns";

const fail = (path: string, message: string): never => {
  throw new FormatError(`${path}: ${message}`);
};

/** A plain object (not null, not an array). */
export function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "expected an object");
  }
  return value as Record<string, unknown>;
}

/** An object with exactly these keys: missing or unexpected ones are refused. */
export function asRecord<K extends string>(
  value: unknown,
  path: string,
  keys: readonly K[],
): Record<K, unknown> {
  const obj = asObject(value, path);
  for (const k of Object.keys(obj)) {
    if (!keys.includes(k as K)) fail(path, `unexpected field ${JSON.stringify(k).slice(0, 66)}`);
  }
  for (const k of keys) if (!Object.hasOwn(obj, k)) fail(path, `missing field "${k}"`);
  return obj as Record<K, unknown>;
}

/** A dense array of at most `maxLength` items (and at least `minLength`); holes are refused. */
export function asArray(value: unknown, path: string, maxLength: number, minLength = 0): unknown[] {
  if (!Array.isArray(value)) return fail(path, "expected an array");
  if (value.length > maxLength) fail(path, `more than ${maxLength} items`);
  if (value.length < minLength) fail(path, `fewer than ${minLength} items`);
  for (let i = 0; i < value.length; i++) if (!(i in value)) fail(`${path}[${i}]`, "missing item");
  return value;
}

const HEX_BY_BYTES = new Map<number, RegExp>();

/** Lowercase hex of exactly `bytes` bytes. */
export function asHex(value: unknown, path: string, bytes: number): string {
  let pattern = HEX_BY_BYTES.get(bytes);
  if (!pattern) HEX_BY_BYTES.set(bytes, (pattern = new RegExp(`^[0-9a-f]{${bytes * 2}}$`)));
  if (typeof value !== "string" || !pattern.test(value)) {
    return fail(path, `expected ${bytes}-byte lowercase hex`);
  }
  return value;
}

/** Hex from a client: case-insensitive on input, canonical (lowercase) on output. */
export const normalizeHex = (value: unknown, path: string, bytes: number): string =>
  asHex(typeof value === "string" ? value.toLowerCase() : value, path, bytes);

/** A safe integer in `[min, max]`. */
export function asSafeInt(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    return fail(path, `expected an integer in [${min}, ${max}]`);
  }
  return value as number;
}

/** An unsigned 32-bit integer ≥ `min` (indices, sequence numbers). */
export const asU32 = (value: unknown, path: string, min = 1): number =>
  asSafeInt(value, path, min, 2 ** 32 - 1);

/** A u32 id given as a number, or as a canonical decimal string (a URL path segment). */
export const asDecimalId = (value: unknown, path: string): number =>
  asU32(typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value) ? Number(value) : value, path);

/** A positive safe integer (ids, rounds). */
export const asPositiveInt = (value: unknown, path: string): number =>
  asSafeInt(value, path, 1, Number.MAX_SAFE_INTEGER);

/** A non-negative safe integer (counts, sizes). */
export const asCount = (value: unknown, path: string): number =>
  asSafeInt(value, path, 0, Number.MAX_SAFE_INTEGER);

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** A well-formed Unicode string (JCS-serializable), at most `maxLength` UTF-16 units. */
export function asString(
  value: unknown,
  path: string,
  maxLength: number,
  pattern?: RegExp,
): string {
  if (typeof value !== "string") return fail(path, "expected a string");
  if (value.length > maxLength) fail(path, `longer than ${maxLength}`);
  if (LONE_SURROGATE.test(value)) fail(path, "invalid Unicode");
  if (pattern && !pattern.test(value)) fail(path, `does not match ${pattern}`);
  return value;
}

/** An ISO 8601 UTC timestamp in the exact form `Date#toISOString` produces. */
export function asIsoTime(value: unknown, path: string): string {
  const s = asString(value, path, 32);
  const t = Date.parse(s);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== s) {
    fail(path, "expected an ISO timestamp");
  }
  return s;
}

/** One of a fixed set of strings. */
export function asOneOf<T extends string>(value: unknown, path: string, options: readonly T[]): T {
  if (!options.includes(value as T)) return fail(path, `expected one of ${options.join(", ")}`);
  return value as T;
}

/** `null`, or a value `read` accepts. */
export function asNullable<T>(value: unknown, read: (v: unknown) => T): T | null {
  return value === null ? null : read(value);
}

/** A document's schema id: exactly `id`. */
export const asSchema = <T extends string>(value: unknown, path: string, id: T): T =>
  asOneOf(value, path, [id]);

/** A ceremony id. */
export const asCeremonyId = (value: unknown, path: string): string =>
  asString(value, path, 64, CEREMONY_ID);

/** A circuit name (well formed; whether the ceremony has it is the caller's check). */
export function asCircuitName(value: unknown, path: string): string {
  const name = asString(value, path, 32, CIRCUIT_NAME);
  if (!isCircuitName(name)) throw new FormatError(`${path}: ${name} is a reserved name`);
  return name;
}

/** A full git commit id. */
export const asCommit = (value: unknown, path: string): string => asString(value, path, 40, COMMIT);
