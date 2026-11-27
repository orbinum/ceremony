/**
 * Whether a key is a setup file, whatever circuits the ceremony uses: what `publish-init` may
 * upload. Which circuits it really has is `init.json`'s to say (the coordinator holds each
 * per-circuit file against the published one).
 */
import { CEREMONY_LAYOUT } from "./constants";
import { setupCircuitOf } from "./setup-circuit-of";

const FIXED_SETUP_KEYS = new Set<string>([
  CEREMONY_LAYOUT.announcement,
  CEREMONY_LAYOUT.init,
  CEREMONY_LAYOUT.ptau,
]);

export const isSetupFileKey = (key: string): boolean =>
  FIXED_SETUP_KEYS.has(key) || setupCircuitOf(key) !== null;
