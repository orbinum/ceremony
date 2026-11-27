/** The attestation body, read as JSON; the action validates it against the linked wallet's scheme. */
import { jsonBody } from "./json-body";

export const attestationBody = jsonBody((v) => ({ body: v }));
