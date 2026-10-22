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
  schedule: { open: string; close: string; beacon: string };
  /** The drand round is fixed here, before anyone can know its value. SPEC §5.2. */
  beacon: {
    network: (typeof DRAND)["network"];
    chain_hash: string;
    round: number;
    iterations_exp: number;
  };
}
