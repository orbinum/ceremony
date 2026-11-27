/** The attestation payload a contributor signs at the end of a session: its accepted records. */
import {
  type AttestationPayload,
  attestedContributionsOf,
  type Chained,
  type ClientInfo,
} from "../../ceremony";

export const buildAttestationPayload = (input: {
  ceremonyId: string;
  githubId: number;
  account: string;
  seq: number;
  records: readonly Chained[];
  client: ClientInfo;
}): AttestationPayload => ({
  ceremony_id: input.ceremonyId,
  github_id: input.githubId,
  account: input.account,
  seq: input.seq,
  contributions: attestedContributionsOf(input.records, input.seq, input.githubId),
  client: input.client,
});
