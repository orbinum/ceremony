/** The wallet families whose accounts sign under `scheme`. */
import type { Scheme } from "@orbinum-ceremony/core";
import type { Family } from "./types";

export const familiesOf = (scheme: Scheme): Family[] =>
  scheme === "eip712" ? ["evm"] : scheme === "sr25519" ? ["substrate"] : ["solana", "substrate"];
