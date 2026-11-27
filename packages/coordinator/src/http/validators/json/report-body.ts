/** `POST /internal/verifications`: a verifier report. */
import { validateReport } from "@orbinum-ceremony/core";
import { jsonBody } from "./json-body";

export const reportBody = jsonBody(validateReport);
