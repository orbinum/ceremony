/**
 * The ceremonies this network ran, the current one included: each one's record (announcement,
 * transcript, keys) stays published under `/archive/<id>/`, so anyone can download and verify it
 * long after the site has moved on to another ceremony.
 */
import { useEffect } from "react";
import { getArchive, getConfig, getMe, signOut } from "../../api";
import { usePoll } from "../../hooks";
import { Notice, Skeleton } from "../../ui";
import { SiteHeader } from "../layout";
import { CeremonyCard } from "./ceremony-card";

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
