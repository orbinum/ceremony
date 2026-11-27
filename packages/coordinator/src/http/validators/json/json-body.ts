/** A JSON body validator over core's `parse`; a body that is not `application/json` reads as `{}`. */
import { validator } from "hono/validator";
import { checked } from "../checked";

export const jsonBody = <T>(parse: (value: unknown) => T) =>
  validator(
    "json",
    checked((value: unknown) => parse(value)),
  );
