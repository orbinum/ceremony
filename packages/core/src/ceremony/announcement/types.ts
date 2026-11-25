/**
 * `ceremony.json`: published, and its SHA-256 pinned on an official channel, before contributions
 * open. Every check in `verify` is rooted here, not in files the coordinator could rewrite.
 * SPEC §6.2.
 */
import type { DRAND } from "../../config";

/** Schema id of the document. */
export const ANNOUNCEMENT_SCHEMA = "orbinum-ceremony/announcement/v1";

/** Networks a ceremony can be for: testnet keys can never pass as mainnet ones. */
export const NETWORKS = ["local", "testnet", "mainnet"] as const;

/** One network. */
export type Network = (typeof NETWORKS)[number];

/**
 * Who may join: `open` admits every account that passes the GitHub thresholds, invited ones ahead
 * of the rest; `closed` admits only the invited, for private rehearsals (never on mainnet).
 */
export const ADMISSION_MODES = ["open", "closed"] as const;

/** One admission mode. */
export type AdmissionMode = (typeof ADMISSION_MODES)[number];

/** The announced invitations. */
export interface Admission {
  mode: AdmissionMode;
  /** Numeric GitHub ids, strictly ascending: stable across renames, unlike logins. */
  invited: readonly number[];
}

/** The announcement document. */
export interface CeremonyAnnouncement {
  schema: typeof ANNOUNCEMENT_SCHEMA;
  ceremony_id: string;
  network: Network;
  /** SHA-256 of the exact bytes of `genesis/init.json`. */
  init_sha256: string;
  /** The audited circuits release: the tag and the full commit it must resolve to. */
  circuits_source: { repo: string; tag: string; commit: string };
  min_contributions: number;
  /** Absent: open, nobody invited (so announcements without invitations keep their bytes). */
  admission?: Admission;
  schedule: { open: string; close: string; beacon: string };
  /** The drand round is fixed here, before anyone can know its value. SPEC §5.2. */
  beacon: {
    network: (typeof DRAND)["network"];
    chain_hash: string;
    round: number;
    iterations_exp: number;
  };
}
