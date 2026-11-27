/**
 * The scheme an extension account signs under, or null if the coordinator cannot take it:
 * multi-chain extensions list Ethereum (`0x…`, ecdsa) accounts here too. An account that declares
 * no type is the Substrate default, sr25519 (its signature is verified anyway).
 */
import type { Scheme } from "@orbinum-ceremony/core";
import type { InjectedAccount } from "../types";

export function schemeOfAccount(a: InjectedAccount): Scheme | null {
  if (a.address.startsWith("0x")) return null;
  if (a.type === undefined || a.type === "sr25519") return "sr25519";
  return a.type === "ed25519" ? "ed25519" : null;
}
