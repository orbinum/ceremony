/** What the ceremony is and what a contribution does, in plain words, with the common questions. */
import { CEREMONY_LAYOUT, GITHUB_THRESHOLDS, QUEUE_RULES } from "@orbinum-ceremony/core";

const minutes = (ms: number) => Math.round(ms / 60_000);

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What does my browser compute?",
    a: (
      <>
        For each circuit of the ceremony it downloads the current proving key, mixes in fresh
        randomness and uploads the result. A verifier checks every upload before it joins the chain.
      </>
    ),
  },
  {
    q: "What happens to my randomness?",
    a: "It is drawn and used inside an isolated Web Worker, never sent anywhere, and discarded when your turn ends. That discarded secret is what keeps the keys safe.",
  },
  {
    q: "How long does it take?",
    a: `A few minutes for all the circuits, at most ${minutes(QUEUE_RULES.activeCapMs)} minutes. Keep the tab open and the computer awake until it ends.`,
  },
  {
    q: "Why GitHub and a wallet?",
    a: (
      <>
        GitHub keeps the line fair (an account at least {GITHUB_THRESHOLDS.minAgeDays} days old,
        with a public repository and a few followers). The wallet signs your contribution so the
        public record attributes it to you. Signing costs nothing and sends no transaction.
      </>
    ),
  },
  {
    q: "Can I contribute from the command line?",
    a: "Yes. Join the line here, create a CLI token in step 3, and run orbinum-ceremony contribute on your own machine. You still sign the attestation here.",
  },
  {
    q: "How can anyone check the result?",
    a: (
      <>
        Every contribution is in the public{" "}
        <a
          className="underline hover:text-accent"
          href={`/artifacts/${CEREMONY_LAYOUT.transcript}`}
        >
          transcript
        </a>
        , with its hashes and signatures. Anyone can re-verify the whole chain with{" "}
        <code>orbinum-ceremony verify</code>.
      </>
    ),
  },
];

export function About() {
  return (
    <aside className="space-y-6">
      <section className="glass-card p-4 sm:p-5">
        <h2 className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted">
          How it works
        </h2>
        <ol className="space-y-3 text-xs text-text">
          <li>
            <strong className="font-sans">Many contributors, one at a time.</strong> Each adds
            secret randomness to the proving keys of Orbinum's private transactions.
          </li>
          <li>
            <strong className="font-sans">One honest contributor is enough.</strong> As long as a
            single participant discards their secret, nobody can forge a proof.
          </li>
          <li>
            <strong className="font-sans">Everything is public.</strong> Each step is verified and
            recorded, so anyone can check the final keys.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted">
          Questions
        </h2>
        <div className="divide-y divide-border border border-border">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-medium text-text hover:bg-overlay-hover">
                {q}
                <span
                  aria-hidden="true"
                  className="text-muted transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="px-4 pb-4 text-xs leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </aside>
  );
}
