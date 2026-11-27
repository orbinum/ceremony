/** Whether a claim was computed on another head than the current one. */
export const isStaleHead = (claim: { inputSha256: string }, head: { outputSha256: string }) =>
  claim.inputSha256 !== head.outputSha256;
