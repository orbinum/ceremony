/** `POST /admin/unhold`: the identity whose hold is lifted. */
import { validateUnholdRequest } from "@orbinum-ceremony/core";
import { jsonBody } from "./json-body";

export const unholdBody = jsonBody(validateUnholdRequest);
