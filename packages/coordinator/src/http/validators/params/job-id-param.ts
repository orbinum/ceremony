/** `:seq/:circuit/:attempt`, a job id. */
import { validateJobId } from "@orbinum-ceremony/core";
import { validator } from "hono/validator";
import { checked } from "../checked";

export const jobIdParam = validator(
  "param",
  checked((p: Record<string, string>) => validateJobId(p)),
);
