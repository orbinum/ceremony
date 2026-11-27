/** The browser's identity: the session cookie, or a local run's development header; never a CLI token. */
import { identityFrom } from "./identity-from";

export const identity = identityFrom(false);
