/** The ceremony at a glance: its phase in words, how many have contributed, the line, its window. */
import type { CeremonyState } from "@orbinum-ceremony/core";
import { getSchedule, getStatus, type Schedule, type Status } from "../../api";
import { usePoll } from "../../hooks";

const PHASE: Record<CeremonyState, { label: string; dot: string }> = {
  SCHEDULED: { label: "Not open yet", dot: "bg-muted" },
  OPEN: { label: "Open", dot: "bg-success" },
  PAUSED: { label: "Paused", dot: "bg-warning" },
  CLOSED: { label: "Closed", dot: "bg-muted" },
  FINALIZED: { label: "Finalized", dot: "bg-accent" },
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg p-3 sm:p-4">
      <dt className="text-[10px] font-medium uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-x-2 font-sans text-base font-bold text-accent sm:text-lg">
        {children}
      </dd>
    </div>
  );
}

export function CeremonyStatus() {
  const { data: status } = usePoll<Status>(getStatus, 15_000);
  const { data: schedule } = usePoll<Schedule>(getSchedule, 3_600_000);
  const phase = status && PHASE[status.phase];
  return (
    <dl className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
      <Stat label="Status">
        {phase ? (
          <>
            <span className={`h-2 w-2 shrink-0 rounded-full ${phase.dot}`} />
            {phase.label}
          </>
        ) : (
          "—"
        )}
      </Stat>
      <Stat label="Contributors">{status ? status.sessions : "—"}</Stat>
      <Stat label="In line">
        {status ? status.queued + (status.active ? 1 : 0) : "—"}
        {status?.active && <span className="text-xs font-normal text-muted">1 contributing</span>}
      </Stat>
      <Stat label="Window">
        {schedule ? (
          <span className="text-sm">
            {day(schedule.open)} – {day(schedule.close)}
          </span>
        ) : (
          "—"
        )}
      </Stat>
    </dl>
  );
}
