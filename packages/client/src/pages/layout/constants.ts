/**
 * What the shared header shows: the pages; the ceremonies there are, and where (each network's
 * ceremony is its own deployment on its own site, its own Worker, storage and keys; mainnet stays
 * off until its deployment exists); each network's name; and a ceremony's phase in words, with
 * the colour of its dot, wherever a page shows one.
 */
import type { CeremonyState } from "@orbinum-ceremony/core";
import type { Config } from "../../api";
import type { Network } from "./types";

export const PAGES = [
  { to: "/", label: "Contribute" },
  { to: "/archive", label: "Archive" },
] as const;

export const NETWORKS: Record<Network, { label: string; site: string; available: boolean }> = {
  mainnet: { label: "Mainnet", site: "https://ceremony.orbinum.network", available: false },
  testnet: { label: "Testnet", site: "https://ceremony.testnet.orbinum.network", available: true },
};

export const NETWORK_LABEL: Record<NonNullable<Config["network"]>, string> = {
  mainnet: "Mainnet",
  testnet: "Testnet",
  local: "Local",
};

export const PHASE: Record<CeremonyState, { label: string; dot: string }> = {
  SCHEDULED: { label: "Not open yet", dot: "bg-muted" },
  OPEN: { label: "Open", dot: "bg-success" },
  PAUSED: { label: "Paused", dot: "bg-warning" },
  CLOSED: { label: "Closed", dot: "bg-muted" },
  FINALIZED: { label: "Finalized", dot: "bg-accent" },
};
