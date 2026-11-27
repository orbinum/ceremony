/**
 * What `contribute` works with. Its options: the coordinator's origin, the officially announced
 * SHA-256 of `ceremony.json` (what heads are checked against), the CLI token minted in the browser,
 * where to keep the session's files (a fresh private directory by default), and the client the
 * records name (this checkout's version and commit by default). A session's summary: its seq, this
 * run's accepted contributions, and how many circuits were accepted before this run (their hashes
 * are in the receipt). One contribution's step, and its attempt: a verdict, or why to try again
 * (the upload did not land).
 */
import type { CircuitName, ClientInfo } from "@orbinum-ceremony/core";
import type { Contributor } from "../../io";
import type { Anchors } from "./anchors";
import type { Verdict } from "./coordinator";

export interface ContributeOptions {
  coordinator: string;
  announcementSha256: string;
  token: string;
  work?: string;
  client?: ClientInfo;
}

export interface ContributionSummary {
  circuit: CircuitName;
  index: number;
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
}

export interface SessionSummary {
  seq: number;
  contributions: ContributionSummary[];
  earlier: number;
}

export interface Step {
  who: Contributor;
  circuit: CircuitName;
  csHash: string;
  anchors: Anchors;
  seq: number;
  client: ClientInfo;
  work: string;
  signal?: AbortSignal;
}

export type Attempt =
  | { verdict: Verdict; summary: ContributionSummary }
  | { verdict: null; why: string };
