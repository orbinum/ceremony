/** The common questions about the ceremony, in plain words with the queue's own numbers. */
import { CEREMONY_LAYOUT, GITHUB_THRESHOLDS, QUEUE_RULES } from "@orbinum-ceremony/core";

const minutes = (ms: number) => Math.round(ms / 60_000);

export const FAQ: { q: string; a: React.ReactNode }[] = [
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
        with a public repository, following a few accounts). The wallet signs your contribution so
        the public record attributes it to you. Signing costs nothing and sends no transaction.
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
