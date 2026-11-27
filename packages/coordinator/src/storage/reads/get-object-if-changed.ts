/**
 * Reads an object unless `ifNoneMatch` (a request's `If-None-Match`) already names its ETag: then
 * its metadata only, no body. No other precondition is taken from the request.
 */
import { guarded } from "../guarded";
import type { Bucket } from "../types";

export const getObjectIfChanged = (bucket: Bucket, key: string, ifNoneMatch?: string) =>
  guarded(`get ${key}`, () =>
    bucket.get(key, ifNoneMatch ? { onlyIf: new Headers({ "if-none-match": ifNoneMatch }) } : {}),
  );
