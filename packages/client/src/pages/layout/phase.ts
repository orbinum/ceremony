/** A ceremony's phase in words, with the colour of its dot, wherever a page shows one. */
import type { CeremonyState } from "@orbinum-ceremony/core";

export const PHASE: Record<CeremonyState, { label: string; dot: string }> = {
  SCHEDULED: { label: "Not open yet", dot: "bg-muted" },
  OPEN: { label: "Open", dot: "bg-success" },
  PAUSED: { label: "Paused", dot: "bg-warning" },
  CLOSED: { label: "Closed", dot: "bg-muted" },
  FINALIZED: { label: "Finalized", dot: "bg-accent" },
};
