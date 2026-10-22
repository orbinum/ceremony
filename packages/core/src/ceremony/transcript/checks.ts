/**
 * What a transcript means, beyond its schema and hash chain: per-circuit links, the acceptance
 * window, the minimum, the anchor, the identities and their signatures, and the sealed beacon.
 * Each check returns its problems (empty: passes). SPEC §2.6, §3.4–3.5, §5, §6.3.
 */
import { type CircuitName, DRAND, SIMULATED_NETWORKS } from "../../config";
import { canonicalJson } from "../../primitives/hashing";
import { type CeremonyAnnouncement, acceptanceWindow, windowState } from "../announcement";
import { roundTime, verifyDrandRound } from "../beacon";
import {
  accountKey,
  linkPayloadOf,
  LOCAL_BUILD,
  LOCAL_VERIFIER,
  verifyAttestation,
  verifyLink,
} from "../identity";
import { circuitsOf, type InitRecord } from "../init";
import { chainGenesis, verifyChain } from "./chain";
import type { BeaconRecord, Chained, ContributionRecord, Transcript } from "./types";
import { attestedContributionsOf, contributionsOf, sealedBeaconOf } from "./views";

/** One named check and its problems. */
export interface TranscriptCheck {
  id: string;
  problems: string[];
  detail?: string;
}

/** The transcript is this ceremony's, anchored in the exact `ceremony.json` bytes. */
export function checkAnchor(
  transcript: Transcript,
  announcement: CeremonyAnnouncement,
  announcementSha256: string,
): string[] {
  return [
    ...(transcript.ceremony_id === announcement.ceremony_id ? [] : ["ceremony id differs"]),
    ...(transcript.anchor.sha256 === announcementSha256 ? [] : ["anchor SHA-256 differs"]),
  ];
}

/**
 * Each circuit's contributions form a gap-free chain of files rooted in its genesis: index k at
 * position k, input = previous output, and the client's h_k equal to the verified one.
 */
export function checkCircuitLinks(records: readonly Chained[], init: InitRecord): string[] {
  return init.circuits.flatMap((c) => {
    let previous = c.genesis_sha256;
    return contributionsOf(records, c.name).flatMap((r, i) => {
      const problems: string[] = [];
      if (r.index !== i + 1) problems.push(`${c.name}: index ${r.index} at position ${i + 1}`);
      if (r.input_sha256 !== previous) {
        problems.push(`${c.name} #${r.index}: input is not the previous output`);
      }
      if (r.client_contribution_hash !== r.contribution_hash) {
        problems.push(`${c.name} #${r.index}: client h_k differs from the verified h_k`);
      }
      previous = r.output_sha256;
      return problems;
    });
  });
}

/** Contributions of circuits the ceremony does not have. */
export function checkKnownCircuits(records: readonly Chained[], init: InitRecord): string[] {
  const known = new Set(circuitsOf(init));
  return records.flatMap((r, i) =>
    r.type === "contribution" && !known.has(r.circuit) ? [`record ${i}: unknown circuit`] : [],
  );
}

/** Every record is this ceremony's; contributions were accepted inside the window. */
export function checkRecordsInWindow(
  records: readonly Chained[],
  announcement: CeremonyAnnouncement,
): string[] {
  const { from, to } = acceptanceWindow(announcement);
  return records.flatMap((r, i) => {
    const problems =
      r.ceremony_id === announcement.ceremony_id ? [] : [`record ${i}: another ceremony`];
    if (r.type === "contribution") {
      const at = Date.parse(r.verified_by.at);
      if (at < from || at > to) {
        problems.push(`${r.circuit} #${r.index}: accepted outside the contribution window`);
      }
    }
    return problems;
  });
}

/** A simulated contribution (`contribute-local`): local client build, or verified in-process. */
const isSimulated = (r: ContributionRecord): boolean =>
  r.client.commit === LOCAL_BUILD || r.verified_by.verifier_version === LOCAL_VERIFIER;

/**
 * Simulated contributions only in rehearsals. On mainnet they would be operator-made entropy
 * standing in for contributors.
 */
export function checkSimulated(
  records: readonly Chained[],
  announcement: CeremonyAnnouncement,
): string[] {
  if (SIMULATED_NETWORKS.includes(announcement.network)) return [];
  return records.flatMap((r) =>
    r.type === "contribution" && isSimulated(r)
      ? [`${r.circuit} #${r.index}: simulated contribution on ${announcement.network}`]
      : [],
  );
}

/**
 * Who contributed, verifiable by anyone (SPEC §3.4–3.5, §6.3): every recorded link signature
 * verifies over the payload it signed, every attestation over its own; an attestation covers
 * exactly its session's earlier contributions by the same identity and wallet, once; each GitHub
 * account and each wallet contributes at most once per circuit, and a GitHub account keeps one
 * wallet (and a wallet one GitHub account) across circuits; and outside a local ceremony only
 * a simulated contribution may lack an identity. Also counts the contributions attested.
 */
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
  // One GitHub account, one wallet, across the whole ceremony (SPEC §3.2).
  const walletOf = new Map<number, string>();
  const holderOf = new Map<string, number>();
  // One GitHub account per session: its first identified record names it.
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

/**
 * A contribution recorded at `at` would be accepted: inside the announced window and before the
 * beacon is sealed. SPEC §5.2, §6.2.
 */
export function checkContributable(
  records: readonly Chained[],
  announcement: CeremonyAnnouncement,
  at: number,
): string[] {
  const { open, close } = announcement.schedule;
  const state = windowState(announcement, at);
  return [
    ...(state === "before" ? [`contributions open at ${open}`] : []),
    ...(state === "closed" ? [`contributions closed at ${close}`] : []),
    ...(sealedBeaconOf(records) ? ["the beacon is sealed: contributions are closed"] : []),
  ];
}

/** Each circuit reached the announced minimum. */
export const checkMinContributions = (
  records: readonly Chained[],
  init: InitRecord,
  announcement: CeremonyAnnouncement,
): string[] =>
  circuitsOf(init).flatMap((c) => {
    const n = contributionsOf(records, c).length;
    return n >= announcement.min_contributions ? [] : [`${c}: ${n}`];
  });

/**
 * The sealed beacon is the announced round, sealed once, after every contribution, verifiable
 * against the pinned drand key, and not sealed before it was emitted. SPEC §5.
 */
export function checkSealedBeacon(
  records: readonly Chained[],
  announcement: CeremonyAnnouncement,
): { beacon?: Chained<BeaconRecord>; problems: string[] } {
  const announced = announcement.beacon;
  const beacons = records.filter((r): r is Chained<BeaconRecord> => r.type === "beacon");
  const beacon = beacons[0];
  if (beacons.length !== 1 || !beacon) return { problems: [`${beacons.length} beacon records`] };

  const problems: string[] = [];
  if (records.slice(records.indexOf(beacon)).some((r) => r.type === "contribution")) {
    problems.push("contribution recorded after the beacon was sealed");
  }
  if (beacon.round !== announced.round)
    problems.push(`round ${beacon.round}, announced ${announced.round}`);
  if (beacon.chain_hash !== DRAND.chainHash) problems.push("beacon from another drand chain");
  if (beacon.iterations_exp !== announced.iterations_exp) problems.push("unexpected iterations");
  if (Date.parse(beacon.sealed_at) < roundTime(beacon.round) * 1000) {
    problems.push("sealed before the round was emitted");
  }
  if (!verifyDrandRound(beacon)) problems.push("drand BLS signature or randomness invalid");
  return { beacon, problems };
}

/**
 * What must hold before the irreversible beacon is applied: contributions closed, the minimum
 * reached, and every contribution inside the window. (A coordinator must also be CLOSED with no
 * verification in flight; that is the operator's state, not the transcript's.)
 */
export function checkFinalizable(
  records: readonly Chained[],
  init: InitRecord,
  announcement: CeremonyAnnouncement,
  now: number,
): string[] {
  const problems: string[] = [];
  if (now < Date.parse(announcement.schedule.close)) {
    problems.push(`contributions are open until ${announcement.schedule.close}`);
  }
  problems.push(
    ...checkMinContributions(records, init, announcement).map((p) => `${p} contributions`),
  );
  problems.push(...checkRecordsInWindow(records, announcement));
  return problems;
}

/**
 * The invariants that hold at every moment of a ceremony: anchor, hash chain, per-circuit links,
 * known circuits, window, no simulated contributions outside rehearsals. The coordinator checks
 * these before publishing.
 */
export function checkTranscriptIntegrity(
  transcript: Transcript,
  announcement: CeremonyAnnouncement,
  announcementSha256: string,
  init: InitRecord,
): TranscriptCheck[] {
  const chain = verifyChain(
    transcript.records,
    chainGenesis(announcement.ceremony_id, announcement),
  );
  return [
    {
      id: "transcript is anchored in the pinned ceremony.json",
      problems: checkAnchor(transcript, announcement, announcementSha256),
    },
    {
      id: "hash chain verifies from the announcement",
      problems: chain.ok ? [] : [`broken at record ${chain.position}`],
      detail: `${transcript.records.length} records`,
    },
    {
      id: "per-circuit contributions link genesis → … → head",
      problems: [
        ...checkKnownCircuits(transcript.records, init),
        ...checkCircuitLinks(transcript.records, init),
      ],
    },
    {
      id: "records belong to this ceremony, inside the announced window",
      problems: checkRecordsInWindow(transcript.records, announcement),
    },
    {
      id: `no simulated contributions on ${announcement.network}`,
      problems: checkSimulated(transcript.records, announcement),
    },
  ];
}

/**
 * Integrity plus what a finished ceremony adds: verifiable identities, the minimum and the sealed
 * beacon.
 */
export function checkTranscript(
  transcript: Transcript,
  announcement: CeremonyAnnouncement,
  announcementSha256: string,
  init: InitRecord,
): { checks: TranscriptCheck[]; beacon?: Chained<BeaconRecord> } {
  const { beacon, problems } = checkSealedBeacon(transcript.records, announcement);
  const identities = checkIdentities(transcript.records, announcement);
  return {
    checks: [
      ...checkTranscriptIntegrity(transcript, announcement, announcementSha256, init),
      {
        id: "signatures verify; one GitHub account and one wallet per circuit",
        problems: identities.problems,
        detail: `${identities.attested} of ${identities.contributions} contributions attested`,
      },
      {
        id: `every circuit has at least ${announcement.min_contributions} contributions`,
        problems: checkMinContributions(transcript.records, init, announcement),
      },
      {
        id: "beacon is the announced drand round, sealed once after all contributions",
        problems,
        ...(beacon ? { detail: `round ${beacon.round}` } : {}),
      },
    ],
    ...(beacon ? { beacon } : {}),
  };
}
