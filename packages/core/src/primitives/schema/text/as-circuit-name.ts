/**
 * A well-formed circuit name that is not an `Object.prototype` key; whether the ceremony has it is
 * the caller's check.
 */
import { FormatError } from "../../errors";
import { asString } from "./as-string";
import { CIRCUIT_NAME } from "../constants";
import { isCircuitName } from "./is-circuit-name";

export function asCircuitName(value: unknown, path: string): string {
  const name = asString(value, path, 32, CIRCUIT_NAME);
  if (!isCircuitName(name)) throw new FormatError(`${path}: ${name} is a reserved name`);
  return name;
}
