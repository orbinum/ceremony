/** Real quicknet rounds, fetched from api.drand.sh. */
import type { DrandRound } from "../../src/ceremony/beacon";

export const R1000: DrandRound = {
  round: 1000,
  randomness: "fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd",
  signature:
    "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39",
};

export const R1001: DrandRound = {
  round: 1001,
  randomness: "b0a591ad1b9002cfc372ac6e30abd3da8d3088d4caae026961743474fb94235f",
  signature:
    "b33bf3667cbd5a82de3a24b4e0e9fe5513cc1a0e840368c6e31f5fcfa79bea03f73896b25883abf2853d10337fb8fa41",
};
