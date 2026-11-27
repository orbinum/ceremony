/** A setup or final file: its key (a setup or final path only), declared SHA-256 and streamed body. */
import {
  CONTENT_SHA256_HEADER,
  isFinalFileKey,
  isSetupFileKey,
  MAX_FILE_BYTES,
  normalizeHex,
} from "@orbinum-ceremony/core";
import { validator } from "hono/validator";
import { checked } from "../checked";
import { Malformed } from "../malformed";
import { streamedBody } from "./streamed-body";

export const publicFileInput = validator(
  "header",
  checked((h: Record<string, string>, c) => {
    const key = new URL(c.req.url).pathname.replace(/^\/admin\/artifacts\//, "");
    if (!isSetupFileKey(key) && !isFinalFileKey(key)) {
      throw new Malformed(`not a setup or final file: ${key}`);
    }
    let sha256: string;
    try {
      sha256 = normalizeHex(h[CONTENT_SHA256_HEADER], CONTENT_SHA256_HEADER, 32);
    } catch {
      throw new Malformed(`${CONTENT_SHA256_HEADER} is required`);
    }
    return { key, sha256, ...streamedBody(c, MAX_FILE_BYTES) };
  }),
);
