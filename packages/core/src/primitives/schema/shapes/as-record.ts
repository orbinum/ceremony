/**
 * An object with exactly these keys: missing or unexpected ones are refused. An unexpected key is
 * quoted as JSON and cut short, so a hostile key cannot flood or control the error text.
 */
import { asObject } from "./as-object";
import { fail } from "../fail";

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
