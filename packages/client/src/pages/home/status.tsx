/** The ceremony at a glance: its phase in words, how many have contributed, the line, its window. */
import type { CeremonyState } from "@orbinum-ceremony/core";
import { getSchedule, type Schedule, type Status } from "../../api";
import { usePoll } from "../../hooks";

const PHASE: Record<CeremonyState, { label: string; dot: string }> = {
  SCHEDULED: { label: "Not open yet", dot: "bg-muted" },
  OPEN: { label: "Open", dot: "bg-success" },
  PAUSED: { label: "Paused", dot: "bg-warning" },
  CLOSED: { label: "Closed", dot: "bg-muted" },
  FINALIZED: { label: "Finalized", dot: "bg-accent" },
};

const NOT_ANNOUNCED = { label: "Not announced yet", dot: "bg-muted" };

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

/** `announced` false: the coordinator has no ceremony yet (nothing to show but that). */
export function CeremonyStatus({ status, announced }: { status?: Status; announced: boolean }) {
  const { data: schedule } = usePoll<Schedule>(getSchedule, 3_600_000);
  const phase = announced ? status && PHASE[status.phase] : NOT_ANNOUNCED;
  return (
    <dl className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
      <Stat label="Status">
        {phase ? (
          <>
            <span className={`h-2 w-2 shrink-0 rounded-full ${phase.dot}`} />
            {phase.label}
            {schedule?.inviteOnly && (
              <span className="text-xs font-normal text-muted">invite only</span>
            )}
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
