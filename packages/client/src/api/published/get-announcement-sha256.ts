/** The SHA-256 of the announcement as served here (the CLI wants the one Orbinum published). */
import { CEREMONY_LAYOUT, sha256Hex } from "@orbinum-ceremony/core";
import { getBytes } from "../http";

export const getAnnouncementSha256 = async () =>
  sha256Hex(await getBytes(`/artifacts/${CEREMONY_LAYOUT.announcement}`));
