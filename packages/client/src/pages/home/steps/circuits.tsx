/** The turn's circuits in session order, each with its stage and the last thing said about it. */
import type { CircuitName } from "@orbinum-ceremony/core";
import type { Stage } from "../../../contribution";
import type { CircuitStages } from "../../../hooks";

const STAGE: Record<Stage, string> = {
  downloading: "Downloading the current key",
  computing: "Adding your randomness",
  checking: "Checking the result",
  uploading: "Uploading",
  verifying: "Being verified",
  accepted: "Accepted",
  rejected: "Rejected",
  retrying: "Trying again",
};

export function Circuits({ order, circuits }: { order: CircuitName[]; circuits: CircuitStages }) {
  return (
    <ol className="divide-y divide-border border border-border">
      {order.map((c, i) => {
        const s = circuits[c];
        const look =
          s?.stage === "accepted"
            ? "text-success"
            : s?.stage === "rejected"
              ? "text-error"
              : s
                ? "text-accent"
                : "text-muted";
        return (
          <li
            key={c}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-xs"
          >
            <span className="flex items-center gap-3">
              <span className="text-muted">{i + 1}</span>
              <span className="font-medium text-text">{c}</span>
            </span>
            <span className={`flex flex-wrap items-center justify-end gap-x-2 text-right ${look}`}>
              {s && s.stage !== "accepted" && s.stage !== "rejected" && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent" />
              )}
              {s ? STAGE[s.stage] : "Waiting"}
              {s?.detail && <span className="text-muted">({s.detail})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
