/** `:seq`, a session number. */
import { asDecimalId } from "@orbinum-ceremony/core";
import { validator } from "hono/validator";
import { checked } from "../checked";

export const seqParam = validator(
  "param",
  checked((p: Record<string, string>) => ({ seq: asDecimalId(p.seq, "seq") })),
);
