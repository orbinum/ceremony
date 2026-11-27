/**
 * The randomness beacon: drand quicknet (League of Entropy, confirmed 2026-10-06 on two relays),
 * how many relays must agree on a round before it is sealed, and the delay between close and the
 * beacon round. `BEACON_ITERATIONS_EXP` is the `zkey beacon` `numIterationsExp`, the snarkjs
 * minimum, enough for drand; `BEACON_ITERATIONS_RANGE` accepts from that minimum up to the most the
 * independent verifier derives. The shortest delay per network lies past the last possible
 * acceptance (close + the verify deadline), and is a full day on mainnet.
 */
import { VERIFY_DEADLINE_MS } from "./verifier";

export const DRAND = {
  network: "quicknet",
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  publicKey:
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  scheme: "bls-unchained-g1-rfc9380",
  genesisTime: 1_692_803_367,
  periodSeconds: 3,
  relays: [
    "https://api.drand.sh",
    "https://api2.drand.sh",
    "https://api3.drand.sh",
    "https://drand.cloudflare.com",
  ],
} as const;

export const BEACON_ITERATIONS_EXP = { drand: 10 } as const;

export const BEACON_ITERATIONS_RANGE = { min: 10, max: 24 } as const;

export const MIN_RELAYS = 2;

export const DEFAULT_BEACON_DELAY_SECONDS = 86_400;

export const MAX_BEACON_DELAY_SECONDS = 365 * 86_400;

export const MIN_BEACON_DELAY_SECONDS = {
  local: 0,
  testnet: VERIFY_DEADLINE_MS / 1000,
  mainnet: 86_400,
} as const;
