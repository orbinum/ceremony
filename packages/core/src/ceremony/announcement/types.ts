/**
 * `ceremony.json`: published, and its SHA-256 pinned on an official channel, before contributions
 * open. Every check in `verify` is rooted here, not in files the coordinator could rewrite. The
 * drand round is fixed here, before anyone can know its value. Invitations are numeric GitHub ids,
 * strictly ascending (stable across renames, unlike logins); an absent `admission` means open with
 * nobody invited, so announcements without invitations keep their bytes. `init_sha256` pins the
 * exact bytes of `genesis/init.json`; `circuits_source` names the audited release's tag and the
 * full commit it must resolve to.
 */
import type { DRAND } from "../../config";
import type { ADMISSION_MODES, ANNOUNCEMENT_SCHEMA, NETWORKS } from "./constants";

export type Network = (typeof NETWORKS)[number];

export type AdmissionMode = (typeof ADMISSION_MODES)[number];

export interface Admission {
  mode: AdmissionMode;
  invited: readonly number[];
}

export interface CeremonyAnnouncement {
  schema: typeof ANNOUNCEMENT_SCHEMA;
  ceremony_id: string;
  network: Network;
  init_sha256: string;
  circuits_source: { repo: string; tag: string; commit: string };
  min_contributions: number;
  admission?: Admission;
  schedule: { open: string; close: string; beacon: string };
  beacon: {
    network: (typeof DRAND)["network"];
    chain_hash: string;
    round: number;
    iterations_exp: number;
  };
}
