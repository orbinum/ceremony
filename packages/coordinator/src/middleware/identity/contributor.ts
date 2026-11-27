/** The browser's identity or a contributor's CLI token: for the session routes a CLI drives. */
import { identityFrom } from "./identity-from";

export const contributor = identityFrom(true);
