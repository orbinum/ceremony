/** An upload claim from a client, exact fields only, its hashes normalized to lowercase. */
import { asClientInfo, CONTRIBUTION_METHODS } from "../../../ceremony";
import { asOneOf, asRecord, normalizeHex } from "../../../primitives/schema";
import type { ContributionClaim } from "../types";

export function validateClaim(v: unknown, p = "claim"): ContributionClaim {
  const o = asRecord(v, p, ["inputSha256", "outputSha256", "contributionHash", "method", "client"]);
  return {
    inputSha256: normalizeHex(o.inputSha256, `${p}.inputSha256`, 32),
    outputSha256: normalizeHex(o.outputSha256, `${p}.outputSha256`, 32),
    contributionHash: normalizeHex(o.contributionHash, `${p}.contributionHash`, 64),
    method: asOneOf(o.method, `${p}.method`, CONTRIBUTION_METHODS),
    client: asClientInfo(o.client, `${p}.client`),
  };
}
