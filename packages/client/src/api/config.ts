/** `GET /api/config`: what the page needs from the deployment serving it. */
import { call } from "./http";

export interface Config {
  /** The network this coordinator's ceremony is for (`null`: misconfigured). */
  network: "mainnet" | "testnet" | "local" | null;
  /** Turnstile's site key; `null` on a local run (no check) or when unset (joining is refused). */
  turnstileSiteKey: string | null;
}

export const getConfig = () => call<Config>("GET", "/api/config");
