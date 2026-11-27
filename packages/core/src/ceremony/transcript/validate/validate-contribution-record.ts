/**
 * Strict schema of a contribution record: exact fields, canonical hex, bounded printable strings,
 * the same identity and client-build rules the online paths apply (a local build is allowed, for
 * simulated contributions), and a link signature present exactly when the identity is.
 */
import { FormatError } from "../../../primitives/errors";
import {
  asCeremonyId,
  asCircuitName,
  asHex,
  asIsoTime,
  asNullable,
  asOneOf,
  asRecord,
  asString,
  asU32,
  NONEMPTY_PRINTABLE,
  ZKEY_NAME,
} from "../../../primitives/schema";
import { asClientInfo, asIdentity, asStoredSignature, CONTRIBUTION_METHODS } from "../../identity";
import type { ContributionRecord } from "../types";

const GIST_URL = /^https:\/\/gist\.github\.com\/[\x21-\x7e]+$/;

export function validateContributionRecord(v: unknown, p: string): ContributionRecord {
  const o = asRecord(v, p, [
    "type",
    "ceremony_id",
    "seq",
    "circuit",
    "index",
    "input_sha256",
    "output_sha256",
    "contribution_hash",
    "client_contribution_hash",
    "zkey_name",
    "delta_after",
    "method",
    "client",
    "identity",
    "link_sig",
    "gist_url",
    "verified_by",
    "verifier_log_sha256",
  ]);
  const by = asRecord(o.verified_by, `${p}.verified_by`, [
    "verifier_version",
    "snarkjs_version",
    "at",
  ]);
  const identity = asNullable(o.identity, (x) => asIdentity(x, `${p}.identity`));
  const linkSig = asNullable(o.link_sig, (x) =>
    asStoredSignature(x, `${p}.link_sig`, identity?.scheme ?? "eip712"),
  );
  if ((identity === null) !== (linkSig === null)) {
    throw new FormatError(`${p}.link_sig: present exactly when identity is`);
  }
  return {
    type: "contribution",
    ceremony_id: asCeremonyId(o.ceremony_id, `${p}.ceremony_id`),
    seq: asU32(o.seq, `${p}.seq`),
    circuit: asCircuitName(o.circuit, `${p}.circuit`),
    index: asU32(o.index, `${p}.index`),
    input_sha256: asHex(o.input_sha256, `${p}.input_sha256`, 32),
    output_sha256: asHex(o.output_sha256, `${p}.output_sha256`, 32),
    contribution_hash: asHex(o.contribution_hash, `${p}.contribution_hash`, 64),
    client_contribution_hash: asHex(
      o.client_contribution_hash,
      `${p}.client_contribution_hash`,
      64,
    ),
    zkey_name: asString(o.zkey_name, `${p}.zkey_name`, 64, ZKEY_NAME),
    delta_after: asHex(o.delta_after, `${p}.delta_after`, 64),
    method: asOneOf(o.method, `${p}.method`, CONTRIBUTION_METHODS),
    client: asClientInfo(o.client, `${p}.client`, { allowLocal: true }),
    identity,
    link_sig: linkSig,
    gist_url: asNullable(o.gist_url, (x) => asString(x, `${p}.gist_url`, 200, GIST_URL)),
    verified_by: {
      verifier_version: asString(
        by.verifier_version,
        `${p}.verified_by.verifier_version`,
        32,
        NONEMPTY_PRINTABLE,
      ),
      snarkjs_version: asString(
        by.snarkjs_version,
        `${p}.verified_by.snarkjs_version`,
        16,
        NONEMPTY_PRINTABLE,
      ),
      at: asIsoTime(by.at, `${p}.verified_by.at`),
    },
    verifier_log_sha256: asHex(o.verifier_log_sha256, `${p}.verifier_log_sha256`, 32),
  };
}
