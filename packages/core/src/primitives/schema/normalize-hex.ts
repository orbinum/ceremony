/** Hex from a client: case-insensitive on input, canonical (lowercase) on output. */
import { asHex } from "./as-hex";

export const normalizeHex = (value: unknown, path: string, bytes: number): string =>
  asHex(typeof value === "string" ? value.toLowerCase() : value, path, bytes);
