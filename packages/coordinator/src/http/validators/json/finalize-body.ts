/** `POST /admin/finalize`: the sealed beacon, chained, and the finals; core checks them later. */
import { validateFinalizeRequest } from "@orbinum-ceremony/core";
import { jsonBody } from "./json-body";

export const finalizeBody = jsonBody(validateFinalizeRequest);
