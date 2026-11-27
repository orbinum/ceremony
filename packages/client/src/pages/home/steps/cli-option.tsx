/**
 * The CLI path, offered inside the line's step: a token minted here lets `orbinum-ceremony
 * contribute` run the turn on one's own machine. The command leaves `--announcement-sha256` for
 * the contributor to fill from Orbinum's own channels: it anchors every check the CLI makes, so it
 * must not come from the coordinator being checked. This site's hash is shown only to compare.
 */
import { useState } from "react";
import { cliToken, getAnnouncementSha256 } from "../../../api";
import { Button, Notice } from "../../../ui";
import { errorText } from "../text";

export function CliOption() {
  const [token, setToken] = useState<{ token: string; expiresAt: number } | null>(null);
  const [sha, setSha] = useState<string>();
  const [error, setError] = useState<unknown>();

  const mint = async () => {
    setError(undefined);
    try {
      const [t, s] = await Promise.all([cliToken(), getAnnouncementSha256()]);
      setToken(t);
      setSha(s);
    } catch (e) {
      setError(e);
    }
  };
  const command = token
    ? `ORBINUM_CEREMONY_TOKEN=${token.token} orbinum-ceremony contribute --coordinator ${window.location.origin} --announcement-sha256 <sha256-published-by-orbinum>`
    : null;

  return (
    <details className="group border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-medium text-text hover:bg-overlay-hover">
        Prefer the command line? Contribute from your own machine
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-4 text-xs text-muted">
        <ol className="list-decimal space-y-1 pl-4">
          <li>Join the line on this page.</li>
          <li>Create a token below and keep it secret: it acts as you for a few hours.</li>
          <li>Run the command it gives on your machine, before your turn comes.</li>
          <li>Come back here to sign your contribution (step 5).</li>
        </ol>
        <Button wide variant="secondary" onClick={mint}>
          Create a CLI token
        </Button>
        {token && command && (
          <div className="space-y-1">
            <textarea
              readOnly
              value={command}
              onFocus={(e) => e.currentTarget.select()}
              className="h-32 w-full border border-border bg-surface p-2 text-base break-all text-text sm:h-28 sm:text-xs"
            />
            <p>
              The token is valid until {new Date(token.expiresAt).toLocaleString()}; treat it like a
              password. Fill in the announcement hash Orbinum published on its own channels, not one
              taken from this site: the CLI checks everything against it.
              {sha && (
                <>
                  {" "}
                  This site serves an announcement whose SHA-256 is{" "}
                  <code className="break-all text-text">{sha}</code>; it should match.
                </>
              )}
            </p>
          </div>
        )}
        {error !== undefined && <Notice tone="error">{errorText(error)}</Notice>}
      </div>
    </details>
  );
}
