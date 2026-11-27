/** A document's schema id: exactly `id`. */
import { asOneOf } from "./as-one-of";

export const asSchema = <T extends string>(value: unknown, path: string, id: T): T =>
  asOneOf(value, path, [id]);
