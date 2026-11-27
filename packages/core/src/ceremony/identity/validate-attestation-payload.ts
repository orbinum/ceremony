/**
 * An attestation payload for a scheme: at least one contribution, each circuit at most once. The
 * coordinator holds it against the session's accepted records in transcript order (the session
 * order), so one session has exactly one signable form.
 */
import { MAX_CIRCUITS } from "../../config";
import { FormatError } from "../../primitives/errors";
import {
  asArray,
  asCeremonyId,
  asCircuitName,
  asHex,
  asPositiveInt,
  asRecord,
  asU32,
} from "../../primitives/schema";
import { asAccount } from "./as-account";
import { asClientInfo } from "./as-client-info";
import type { AttestationPayload, Scheme } from "./types";

export function validateAttestationPayload(
  v: unknown,
  scheme: Scheme,
  p = "attestation",
): AttestationPayload {
  const o = asRecord(v, p, [
    "ceremony_id",
    "github_id",
    "account",
    "seq",
    "contributions",
    "client",
  ]);
  const contributions = asArray(o.contributions, `${p}.contributions`, MAX_CIRCUITS, 1).map(
    (c, i) => {
      const q = `${p}.contributions[${i}]`;
      const e = asRecord(c, q, [
        "circuit",
        "index",
        "input_sha256",
        "output_sha256",
        "contribution_hash",
      ]);
      return {
        circuit: asCircuitName(e.circuit, `${q}.circuit`),
        index: asU32(e.index, `${q}.index`),
        input_sha256: asHex(e.input_sha256, `${q}.input_sha256`, 32),
        output_sha256: asHex(e.output_sha256, `${q}.output_sha256`, 32),
        contribution_hash: asHex(e.contribution_hash, `${q}.contribution_hash`, 64),
      };
    },
  );
  if (new Set(contributions.map((c) => c.circuit)).size !== contributions.length) {
    throw new FormatError(`${p}.contributions: a circuit appears twice`);
  }
  return {
    ceremony_id: asCeremonyId(o.ceremony_id, `${p}.ceremony_id`),
    github_id: asPositiveInt(o.github_id, `${p}.github_id`),
    account: asAccount(o.account, `${p}.account`, scheme),
    seq: asU32(o.seq, `${p}.seq`),
    contributions,
    client: asClientInfo(o.client, `${p}.client`),
  };
}
