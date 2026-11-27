/** This client as uploads and attestations name it, its version and commit set at build time. */
import type { ClientInfo } from "@orbinum-ceremony/core";

export const CLIENT: ClientInfo = {
  name: "orbinum-ceremony-web",
  version: ORBINUM_CLIENT_VERSION,
  commit: ORBINUM_CLIENT_COMMIT,
};
