/**
 * The setup files published once before opening (`publish-init`), in upload order. The
 * announcement goes last: published files are immutable, so it must never be public while a file
 * it pins could still fail to upload.
 */
import { circuitsOf, type InitRecord } from "../init";
import { CEREMONY_LAYOUT } from "./constants";

export const setupFiles = (init: InitRecord): string[] => [
  CEREMONY_LAYOUT.init,
  ...circuitsOf(init).flatMap((c) => [CEREMONY_LAYOUT.r1cs(c), CEREMONY_LAYOUT.zkey(c, 0)]),
  CEREMONY_LAYOUT.ptau,
  CEREMONY_LAYOUT.announcement,
];
