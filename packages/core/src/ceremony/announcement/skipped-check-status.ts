/**
 * How a verification check that did not run counts: a skipped security check (one that binds the
 * ceremony to something external, such as the circuits repo, the vk packer or the independent
 * verifier) fails a full verification; it is only a skip in local mode.
 */
export const skippedCheckStatus = (security: boolean, local: boolean): "skip" | "fail" =>
  security && !local ? "fail" : "skip";
