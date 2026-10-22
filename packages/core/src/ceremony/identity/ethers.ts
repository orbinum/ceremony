/** Typed data in the argument form ethers' `signTypedData` / `verifyTypedData` expect. */
import type { TypedData } from "./eip712";

/** `[domain, types, message]`; ethers derives `EIP712Domain` itself, so it is left out. */
export function ethersTypedData<P extends "Link" | "Attestation">(t: TypedData<P>) {
  const { EIP712Domain: _domain, ...types } = t.types as Record<string, unknown>;
  return [t.domain, types as Record<string, { name: string; type: string }[]>, t.message] as const;
}
