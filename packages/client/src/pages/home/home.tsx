/**
 * The contributor's page: what the ceremony is and where it stands, then how to contribute as
 * guided steps, beside how it works.
 */
import { useState } from "react";
import { ApiError, getConfig, getMe, getStatus, signInOutcomeOf, signOut } from "../../api";
import { usePoll } from "../../hooks";
import { Notice } from "../../ui";
import { SiteHeader } from "../layout";
import { About } from "./about";
import { Journey } from "./journey";
import { CeremonyStatus } from "./status";
import { errorText, signInText } from "./text";

/** The callback's outcome, read once; the query is then dropped so a reload does not repeat it. */
function useSignInOutcome() {
  const [outcome] = useState(() => {
    const o = signInOutcomeOf(window.location.search);
    if (o) window.history.replaceState(null, "", window.location.pathname);
    return o && signInText(o);
  });
  return outcome;
}

export function Home() {
  const outcome = useSignInOutcome();
  const { data: me, error, reload } = usePoll(getMe, 60_000);
  const { data: config } = usePoll(getConfig, 3_600_000);
  const { data: status, error: statusError } = usePoll(getStatus, 15_000);
  // Undefined until the status answers: the page then knows whether there is a ceremony at all.
  const announced =
    status !== undefined
      ? true
      : statusError === undefined
        ? undefined
        : !(statusError instanceof ApiError && statusError.code === "not-configured");

  return (
    <>
      <SiteHeader
        network={config?.network}
        account={me && { login: me.login, signOut: () => void signOut().then(reload) }}
      />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:space-y-8 sm:py-12">
        <section className="max-w-3xl space-y-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
            Groth16 phase-2 · Orbinum circuits
          </p>
          <h1 className="wordmark text-3xl leading-tight sm:text-5xl">Trusted Setup Ceremony</h1>
          <p className="text-sm leading-relaxed text-muted">
            Orbinum's private transactions are proven with keys that need secret randomness to be
            made. Add yours: as long as one contributor keeps their secret out of anyone's hands,
            the keys are safe. It takes a few minutes in your browser.
          </p>
        </section>

        <CeremonyStatus status={status} announced={announced !== false} />

        {/* Before the announcement, the sign-in step already says why. */}
        {outcome && announced && <Notice tone="error">{outcome}</Notice>}
        {error !== undefined && <Notice tone="error">{errorText(error)}</Notice>}

        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="glass-card p-4 sm:p-8">
            <h2 className="mb-6 text-[10px] font-medium uppercase tracking-widest text-muted">
              How to contribute
            </h2>
            {/* Loading (no answer yet) shows placeholders; a failed load shows only its notice. */}
            {(me !== undefined || error === undefined) && (
              <Journey me={me} config={config} announced={announced} reloadMe={reload} />
            )}
          </section>
          <About />
        </div>
      </main>
    </>
  );
}
