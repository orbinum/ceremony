/**
 * The coordinator's answers as this page types them. Typed, not validated: the coordinator also
 * serves this code, so a page that doubted its answers could not doubt the code reading them. What
 * the contribution relies on is checked anyway, with core's own rules.
 */
import type {
  CeremonyAnnouncement,
  ClientInfo,
  headView,
  jobResultView,
  publicStatusOf,
  Scheme,
  slotView,
  statusOf,
} from "@orbinum-ceremony/core";

export type ArchivedStatus = Omit<ReturnType<typeof statusOf>, "contributors"> & {
  contributors?: number;
};

export interface ArchivedCeremony {
  id: string;
  current: boolean;
  announcement: CeremonyAnnouncement | null;
  announcementSha256: string | null;
  status: ArchivedStatus | null;
}

export interface Schedule {
  open: string;
  close: string;
  inviteOnly: boolean;
}

export interface Config {
  network: "mainnet" | "testnet" | "local" | null;
  turnstileSiteKey: string | null;
}

export interface Me {
  ceremonyId: string;
  githubId: number;
  login: string;
  linked: {
    scheme: Scheme;
    account: string;
    linkedAt: number;
    changeRefusal: "already-linked" | "busy" | null;
  } | null;
}

export type Status = ReturnType<typeof publicStatusOf>;

export type Slot = ReturnType<typeof slotView>;

export type Head = ReturnType<typeof headView>;

export type JobResult = ReturnType<typeof jobResultView>;

export interface UploadClaim {
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
  method: "browser";
  client: ClientInfo;
}
