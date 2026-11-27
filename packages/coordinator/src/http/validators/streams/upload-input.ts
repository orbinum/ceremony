/** An upload: its claim (JSON in `X-Ceremony-Claim`, size-bounded) and its streamed body. */
import {
  CLAIM_HEADER,
  type ContributionClaim,
  MAX_CLAIM_BYTES,
  MAX_FILE_BYTES,
  parseJsonText,
  validateClaim,
} from "@orbinum-ceremony/core";
import { validator } from "hono/validator";
import { checked } from "../checked";
import { Malformed } from "../malformed";
import { streamedBody } from "./streamed-body";

export const uploadInput = validator(
  "header",
  checked((h: Record<string, string>, c) => {
    let claim: ContributionClaim;
    try {
      const raw = h[CLAIM_HEADER];
      if (!raw || raw.length > MAX_CLAIM_BYTES) throw new Error("claim");
      claim = validateClaim(parseJsonText(raw, CLAIM_HEADER));
    } catch {
      throw new Malformed(`missing or malformed ${CLAIM_HEADER}`);
    }
    return { claim, ...streamedBody(c, MAX_FILE_BYTES) };
  }),
);
