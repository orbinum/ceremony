/** A full git commit id: ref names and revision expressions are refused. */
import { asString } from "./as-string";
import { COMMIT } from "./constants";

export const asCommit = (value: unknown, path: string): string => asString(value, path, 40, COMMIT);
