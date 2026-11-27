/** Refuses a request body larger than `maxSize` (declared or streamed) before a handler reads it. */
import { bodyLimit } from "hono/body-limit";
import { fail } from "./answers";

export const limitBody = (maxSize: number) =>
  bodyLimit({ maxSize, onError: (c) => fail(c, "too-large", `body larger than ${maxSize} bytes`) });
