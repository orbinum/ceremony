/**
 * Typed data as `[domain, types, message]`, the argument form ethers' `signTypedData` and
 * `verifyTypedData` expect; ethers derives `EIP712Domain` itself, so it is left out.
 */
import type { TypedData } from "./types";

export function ethersTypedData<P extends "Link" | "Attestation">(t: TypedData<P>) {
  const { EIP712Domain: _domain, ...types } = t.types as Record<string, unknown>;
  return [t.domain, types as Record<string, { name: string; type: string }[]>, t.message] as const;
}
