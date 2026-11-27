/**
 * One archived ceremony: what it was, where it stands, its files and how to verify it. The files
 * listed are the ones a verifier starts from: what every check is rooted in, and the record itself.
 */
import { type ArchivedCeremony, archivedFile } from "../../api";
import { PHASE } from "../layout";
import { Badge } from "./badge";
import { Fact } from "./fact";
import { Verify } from "./verify";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const FILES = ["ceremony.json", "genesis/init.json", "transcript.json", "status.json"] as const;

export function CeremonyCard({ c, origin }: { c: ArchivedCeremony; origin: string }) {
  const a = c.announcement;
  const phase = c.status && PHASE[c.status.phase];
  const heads = Object.entries(c.status?.heads ?? {});
  return (
    <article className="glass-card space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 break-all font-sans text-base font-bold text-accent sm:text-lg">
          {c.id}
        </h2>
        {c.current && <Badge>Current</Badge>}
        {a?.admission?.mode === "closed" && <Badge>Invite only</Badge>}
        {phase && (
          <span className="flex items-center gap-1.5 text-xs text-text">
            <span className={`h-2 w-2 shrink-0 rounded-full ${phase.dot}`} />
            {phase.label}
          </span>
        )}
      </header>

      {a ? (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Network">{a.network}</Fact>
          <Fact label="Window">
            {day(a.schedule.open)} – {day(a.schedule.close)}
          </Fact>
          <Fact label="Contributors">{c.status?.contributors ?? "—"}</Fact>
          <Fact label="Minimum per circuit">{a.min_contributions}</Fact>
        </dl>
      ) : (
        <p className="text-sm text-muted">Its announcement could not be read.</p>
      )}

      {heads.length > 0 && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
            Contributions per circuit
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text">
            {heads.map(([circuit, head]) => (
              <li key={circuit}>
                {circuit} <span className="text-muted">{head?.index ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted">Files</p>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {FILES.map((file) => (
            <li key={file}>
              <a className="underline hover:text-accent" href={archivedFile(c.id, file)}>
                {file}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <Verify c={c} origin={origin} />
    </article>
  );
}
