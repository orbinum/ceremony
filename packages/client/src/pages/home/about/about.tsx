/**
 * What the ceremony is and what a contribution does, in plain words, with links to the
 * documentation and the common questions. The links open in a new tab: leaving this page during a
 * turn would end it.
 */
import { DOCS } from "../text";
import { FAQ } from "./faq";

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
        <ul className="mt-4 space-y-2 border-t border-border pt-4 text-xs">
          {DOCS.map((d) => (
            <li key={d.href}>
              <a
                href={d.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-text underline underline-offset-4 hover:text-accent"
              >
                {d.label}
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
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
