/**
 * The ceremony at a glance: its phase in words, how many have contributed, the line, its window.
 * `announced` false: the coordinator has no ceremony yet, nothing to show but that.
 */
import { getSchedule, type Schedule, type Status } from "../../../api";
import { usePoll } from "../../../hooks";
import { PHASE } from "../../layout";
import { Stat } from "./stat";

const NOT_ANNOUNCED = { label: "Not announced yet", dot: "bg-muted" };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

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
      <Stat label="Contributors">{status ? status.contributors : "—"}</Stat>
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
