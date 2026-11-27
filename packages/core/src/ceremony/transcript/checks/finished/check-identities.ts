/**
 * Who contributed, verifiable by anyone: every recorded link signature verifies over the payload
 * it signed, every attestation over its own; an attestation covers exactly its session's earlier
 * contributions by the same identity and wallet, once; a session belongs to one GitHub account
 * (its first identified record names it); each GitHub account and each wallet contributes at most
 * once per circuit, and across the whole ceremony a GitHub account keeps one wallet and a wallet
 * one GitHub account; outside a local ceremony only a simulated contribution may lack an identity.
 * Also counts the contributions attested. Each distinct signature is verified once.
 */
import type { CircuitName } from "../../../../config";
import { canonicalJson } from "../../../../primitives/hashing";
import type { CeremonyAnnouncement } from "../../../announcement";
import { accountKey, linkPayloadOf, verifyAttestation, verifyLink } from "../../../identity";
import { attestedContributionsOf } from "../../reads";
import type { Chained, ContributionRecord } from "../../types";
import { isSimulated } from "../integrity";

export function checkIdentities(
  records: readonly Chained[],
  announcement: CeremonyAnnouncement,
): { problems: string[]; attested: number; contributions: number } {
  const problems: string[] = [];
  const verified = new Map<string, boolean>();
  const once = (key: string, verify: () => boolean) => {
    let ok = verified.get(key);
    if (ok === undefined) verified.set(key, (ok = verify()));
    return ok;
  };
  const seen = new Map<CircuitName, { ids: Set<number>; keys: Set<string> }>();
  const walletOf = new Map<number, string>();
  const holderOf = new Map<string, number>();
  const ownerOf = new Map<number, number>();
  const sessions = new Map<number, Chained<ContributionRecord>[]>();
  const attestedSessions = new Set<number>();
  let attested = 0;
  let contributions = 0;

  for (const r of records) {
    if (r.type === "contribution") {
      contributions += 1;
      const session = sessions.get(r.seq) ?? [];
      session.push(r);
      sessions.set(r.seq, session);
      const where = `${r.circuit} #${r.index}`;
      const id = r.identity;
      if (id === null || r.link_sig === null) {
        if (announcement.network !== "local" && !isSimulated(r)) {
          problems.push(`${where}: no identity outside a simulated contribution`);
        }
        continue;
      }
      const owner = ownerOf.get(r.seq) ?? id.github_id;
      if (owner !== id.github_id) {
        problems.push(`${where}: session ${r.seq} already belongs to GitHub id ${owner}`);
      }
      ownerOf.set(r.seq, owner);
      const payload = linkPayloadOf(r.ceremony_id, id);
      const sig = r.link_sig;
      const key = `link ${id.scheme} ${sig} ${canonicalJson(payload)}`;
      if (!once(key, () => verifyLink(id.scheme, payload, sig))) {
        problems.push(`${where}: link signature does not verify`);
      }
      const circuit = seen.get(r.circuit) ?? { ids: new Set<number>(), keys: new Set<string>() };
      seen.set(r.circuit, circuit);
      if (circuit.ids.has(id.github_id)) problems.push(`${where}: GitHub id ${id.github_id} again`);
      circuit.ids.add(id.github_id);
      const wallet = accountKey(id.scheme, id.account);
      if (wallet === null) problems.push(`${where}: not a valid ${id.scheme} account`);
      else if (circuit.keys.has(wallet)) problems.push(`${where}: the same wallet again`);
      else {
        circuit.keys.add(wallet);
        const bound = walletOf.get(id.github_id) ?? wallet;
        const holder = holderOf.get(wallet) ?? id.github_id;
        if (bound !== wallet)
          problems.push(`${where}: GitHub id ${id.github_id} with another wallet`);
        if (holder !== id.github_id) problems.push(`${where}: the wallet of GitHub id ${holder}`);
        walletOf.set(id.github_id, bound);
        holderOf.set(wallet, holder);
      }
    } else if (r.type === "attestation") {
      const { payload, seq } = r;
      const where = `attestation of session ${seq}`;
      if (!verifyAttestation(r.scheme, payload, r.signature)) {
        problems.push(`${where}: signature does not verify`);
      }
      if (attestedSessions.has(seq)) problems.push(`${where}: session attested twice`);
      attestedSessions.add(seq);
      const earlier = sessions.get(seq) ?? [];
      const covered = attestedContributionsOf(earlier, seq, payload.github_id);
      const signer = earlier.filter((c) => c.identity?.github_id === payload.github_id);
      if (
        covered.length === 0 ||
        canonicalJson(covered) !== canonicalJson(payload.contributions) ||
        signer.some(
          (c) => c.identity?.account !== payload.account || c.identity.scheme !== r.scheme,
        )
      ) {
        problems.push(`${where}: does not cover exactly the session's contributions`);
      } else {
        attested += covered.length;
      }
    }
  }
  return { problems, attested, contributions };
}
