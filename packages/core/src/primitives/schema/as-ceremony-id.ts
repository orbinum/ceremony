/** A ceremony id: lowercase, digits and hyphens, at most 64 characters. */
import { asString } from "./as-string";
import { CEREMONY_ID } from "./constants";

export const asCeremonyId = (value: unknown, path: string): string =>
  asString(value, path, 64, CEREMONY_ID);
