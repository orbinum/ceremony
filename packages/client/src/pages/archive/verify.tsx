/**
 * How to check an archived ceremony oneself: mirror it from here with the CLI, rooted in the
 * announcement hash Orbinum published on its own channels, never one taken from this site, which
 * shows its own only to compare.
 */
import type { ArchivedCeremony } from "../../api";

export function Verify({ c, origin }: { c: ArchivedCeremony; origin: string }) {
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
