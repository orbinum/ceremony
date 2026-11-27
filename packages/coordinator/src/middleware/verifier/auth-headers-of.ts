/** The verifier's request-authentication headers of a request, as core reads them. */
import { requestAuthOf } from "@orbinum-ceremony/core";
import type { Context } from "hono";
import type { AppEnv } from "../../env";

export const authHeadersOf = (c: Context<AppEnv>) => requestAuthOf((name) => c.req.header(name));
