/**
 * Whether a contribution was simulated (`contribute-local`): made by a local client build, or
 * verified in-process by the cli.
 */
import { LOCAL_BUILD, LOCAL_VERIFIER } from "../../../identity";
import type { ContributionRecord } from "../../types";

export const isSimulated = (r: ContributionRecord): boolean =>
  r.client.commit === LOCAL_BUILD || r.verified_by.verifier_version === LOCAL_VERIFIER;
