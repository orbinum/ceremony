/**
 * The ceremonies this network ran, the current one included: each one's record (announcement,
 * transcript, keys) stays published under `/archive/<id>/`, so anyone can download and verify it
 * long after the site has moved on to another ceremony.
 */
import { useEffect } from "react";
import {
  type ArchivedCeremony,
  archivedFile,
  getArchive,
  getConfig,
  getMe,
  signOut,
} from "../../api";
import { usePoll } from "../../hooks";
import { Notice, Skeleton } from "../../ui";
import { PHASE, SiteHeader } from "../layout";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** The files a verifier starts from: what every check is rooted in, and the record itself. */
const FILES = ["ceremony.json", "genesis/init.json", "transcript.json", "status.json"] as const;

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted">
      {children}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-text">{children}</dd>
    </div>
  );
}

/** How to check it oneself: mirror it from here, rooted in the hash Orbinum published. */
function Verify({ c, origin }: { c: ArchivedCeremony; origin: string }) {
  const command = `pnpm ceremony download --from ${origin}/archive/${c.id} --dir ${c.id} --announcement-sha256 <sha256-published-by-orbinum>`;
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer text-text">Verify it yourself</summary>
      <div className="mt-3 space-y-2">
        <textarea
          readOnly
          value={command}
          onFocus={(e) => e.currentTarget.select()}
          className="h-20 w-full border border-border bg-surface p-2 text-base break-all text-text sm:text-xs"
        />
        <p>
          The download checks every file against the announcement; then run{" "}
          <code className="text-text">orbinum-ceremony verify</code> on the copy. Use the
          announcement hash Orbinum published on its own channels, not one taken from this site.
          {c.announcementSha256 && (
            <>
              {" "}
              This site serves an announcement whose SHA-256 is{" "}
              <code className="break-all text-text">{c.announcementSha256}</code>; it should match.
            </>
          )}
        </p>
      </div>
    </details>
  );
}

/** One ceremony: what it was, where it stands, its files and how to verify it. */
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
          <Fact label="Contributors">{c.status ? c.status.sessions : "—"}</Fact>
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

export function Archive() {
  const { data: config } = usePoll(getConfig, 3_600_000);
  const { data: me, reload } = usePoll(getMe, 60_000);
  const { data: ceremonies, error } = usePoll(getArchive, 300_000);

  useEffect(() => {
    const previous = document.title;
    document.title = "Archive · Orbinum Trusted Setup Ceremony";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <>
      <SiteHeader
        network={config?.network}
        account={me && { login: me.login, signOut: () => void signOut().then(reload) }}
      />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:space-y-8 sm:py-12">
        <section className="max-w-3xl space-y-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
            Public record
          </p>
          <h1 className="wordmark text-3xl leading-tight sm:text-5xl">Ceremony Archive</h1>
          <p className="text-sm leading-relaxed text-muted">
            Every ceremony this network has run. Its announcement, transcript and keys stay
            published here, so anyone can download and verify it at any time.
          </p>
        </section>

        {error !== undefined && ceremonies === undefined && (
          <Notice tone="error">The archive could not be loaded. Try again later.</Notice>
        )}
        {ceremonies === undefined && error === undefined && (
          <section className="glass-card p-4 sm:p-6">
            <Skeleton lines={3} label="Loading the archive" />
          </section>
        )}
        {ceremonies?.length === 0 && (
          <p className="text-sm text-muted">No ceremony has been published on this network yet.</p>
        )}
        {ceremonies && ceremonies.length > 0 && (
          <ul className="space-y-4">
            {ceremonies.map((c) => (
              <li key={c.id}>
                <CeremonyCard c={c} origin={window.location.origin} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
