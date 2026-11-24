/**
 * Steps 4 and 5 of the page (SPEC §4.1): the turn itself (extra entropy and Start, each circuit's
 * progress), then the attestation signed with the linked wallet, and the receipt. The turn's state
 * belongs to the page (`useTurn`), which shows each half in its own step.
 */
import type { CircuitName } from "@orbinum-ceremony/core";
import { useEffect, useState } from "react";
import type { Me, Slot } from "../../api";
import { saveReceipt } from "../../attestation";
import type { Stage } from "../../contribution";
import type { CircuitStages, useTurn } from "../../hooks";
import { Button, Notice } from "../../ui";
import { ChooseWallet, familiesOf } from "../../wallets";
import { errorText } from "./text";
import { ConnectWalletModal } from "./connect-wallet-modal";

export type Turn = ReturnType<typeof useTurn>;

const STAGE: Record<Stage, string> = {
  downloading: "Downloading the current key",
  computing: "Adding your randomness",
  checking: "Checking the result",
  uploading: "Uploading",
  verifying: "Being verified",
  accepted: "Accepted",
  rejected: "Rejected",
  retrying: "Trying again",
};

/** Seconds left until `deadline` (ms), ticking every second; null without one. */
function useSecondsLeft(deadline: number | null): number | null {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

function Circuits({ order, circuits }: { order: CircuitName[]; circuits: CircuitStages }) {
  return (
    <ol className="divide-y divide-border border border-border">
      {order.map((c, i) => {
        const s = circuits[c];
        const look =
          s?.stage === "accepted"
            ? "text-success"
            : s?.stage === "rejected"
              ? "text-error"
              : s
                ? "text-accent"
                : "text-muted";
        return (
          <li
            key={c}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-xs"
          >
            <span className="flex items-center gap-3">
              <span className="text-muted">{i + 1}</span>
              <span className="font-medium text-text">{c}</span>
            </span>
            <span className={`flex flex-wrap items-center justify-end gap-x-2 text-right ${look}`}>
              {s && s.stage !== "accepted" && s.stage !== "rejected" && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent" />
              )}
              {s ? STAGE[s.stage] : "Waiting"}
              {s?.detail && <span className="text-muted">({s.detail})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Step 4 while it is the account's turn: start it, then follow each circuit. */
export function ContributeStep(props: { turn: Turn; slot: Slot; onSkip: () => Promise<void> }) {
  const { turn, slot } = props;
  const { state, start, reset } = turn;
  const [text, setText] = useState("");
  const left = useSecondsLeft(state.kind === "idle" ? (slot.slot?.claimBy ?? null) : null);

  if (state.kind === "running") {
    return (
      <>
        {state.paused && (
          <Notice tone="info">The ceremony is paused; your turn resumes on its own.</Notice>
        )}
        <Circuits order={state.order} circuits={state.circuits} />
        <Notice tone="info">
          Keep this tab open and your computer awake until every circuit is done.
        </Notice>
      </>
    );
  }

  if (state.kind === "failed") {
    return (
      <>
        <Notice tone="error">{errorText(state.error)}</Notice>
        <Button wide variant="secondary" onClick={reset}>
          Back
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="border border-accent bg-surface p-4">
        <p className="font-sans text-base font-bold text-accent">It is your turn.</p>
        <p className="mt-1 text-xs text-muted">
          {left !== null
            ? `Start within ${left} s, or the turn passes to the next person in line.`
            : "Start when you are ready."}
        </p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
          Extra randomness (optional)
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type anything. It stays in this browser and is never sent."
          className="h-20 w-full border border-border bg-surface p-2 text-base text-text placeholder:text-muted focus:border-muted focus:outline-none sm:text-xs"
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button wide onClick={() => void start(text).then(() => setText(""))}>
          Start contributing
        </Button>
        {slot.slot?.claimed === false && (
          <Button wide variant="secondary" onClick={() => void props.onSkip()}>
            Give my turn away
          </Button>
        )}
      </div>
    </>
  );
}

/** Step 5: sign the accepted contributions with the linked wallet, then the receipt. */
export function SignStep({ turn, me }: { turn: Turn; me: Me }) {
  const { state, sign, skip } = turn;
  // Several wallets could hold the linked account: the dialog asks which, until dismissed.
  const [dismissed, setDismissed] = useState(false);

  if (state.kind === "done") {
    const { receipt } = state;
    return (
      <>
        <div className="border border-success-mix bg-success-mix p-4">
          <p className="font-sans text-base font-bold text-success">Thank you for contributing.</p>
          <p className="mt-1 text-xs text-text">
            {state.attested
              ? `Session #${state.seq} is recorded and signed with your wallet.`
              : `Session #${state.seq} has ended; its accepted contributions are recorded, unsigned.`}
          </p>
        </div>
        {receipt && (
          <Button wide variant="secondary" onClick={() => saveReceipt(receipt)}>
            Download the receipt
          </Button>
        )}
      </>
    );
  }

  if (state.kind !== "signing") return null;
  return (
    <>
      <p>
        Sign what you contributed with your linked wallet. The signature attributes it to you in the
        public transcript; it sends no transaction and costs nothing.
      </p>
      <ul className="divide-y divide-border border border-border text-xs">
        {state.accepted.map((a) => (
          <li key={a.circuit} className="flex items-center justify-between gap-4 px-3 py-2.5">
            <span className="shrink-0 font-medium text-text">
              {a.circuit} <span className="text-muted">#{a.index}</span>
            </span>
            <span className="min-w-0 truncate text-muted">{a.contributionHash.slice(0, 24)}…</span>
          </li>
        ))}
        {state.earlier.map((c) => (
          <li key={c} className="flex justify-between gap-4 px-3 py-2.5">
            <span className="font-medium text-text">{c}</span>
            <span className="text-muted">accepted earlier in this session</span>
          </li>
        ))}
      </ul>
      {state.error instanceof ChooseWallet && me.linked && !dismissed && (
        <ConnectWalletModal
          title="Pick your linked wallet"
          families={familiesOf(me.linked.scheme)}
          onClose={() => setDismissed(true)}
          onConnected={(wallet) => sign(wallet)}
        />
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          wide
          disabled={state.busy}
          onClick={() => {
            setDismissed(false);
            void sign();
          }}
        >
          Sign with my wallet
        </Button>
        <Button wide variant="secondary" disabled={state.busy} onClick={() => void skip()}>
          Finish without signing
        </Button>
      </div>
      {state.error !== undefined && !(state.error instanceof ChooseWallet) && (
        <Notice tone="error">{errorText(state.error)}</Notice>
      )}
    </>
  );
}
