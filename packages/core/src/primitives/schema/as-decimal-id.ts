/** A u32 id given as a number, or as a canonical decimal string (a URL path segment). */
import { asU32 } from "./as-u32";

export const asDecimalId = (value: unknown, path: string): number =>
  asU32(typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value) ? Number(value) : value, path);
