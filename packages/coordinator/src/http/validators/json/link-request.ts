/** `POST /api/link`: scheme, payload, signature. */
import { validateLinkRequest } from "@orbinum-ceremony/core";
import { jsonBody } from "./json-body";

export const linkRequest = jsonBody(validateLinkRequest);
