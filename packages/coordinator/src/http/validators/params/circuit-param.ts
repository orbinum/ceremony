/** `:circuit`, a well-formed circuit name; whether the ceremony has it is the route's to say. */
import { asCircuitName } from "@orbinum-ceremony/core";
import { validator } from "hono/validator";
import { checked } from "../checked";
import { Malformed } from "../malformed";

export const circuitParam = validator(
  "param",
  checked((p: Record<string, string>) => {
    try {
      return { circuit: asCircuitName(p.circuit, "circuit") };
    } catch {
      throw new Malformed("not a circuit name");
    }
  }),
);
