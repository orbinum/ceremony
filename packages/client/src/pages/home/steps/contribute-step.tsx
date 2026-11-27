/**
 * Step 4 while it is the account's turn: extra entropy and Start (within the claim window, or the
 * turn passes on), then each circuit's progress.
 */
import { useState } from "react";
import type { Slot } from "../../../api";
import { Button, Notice } from "../../../ui";
import { errorText } from "../text";
import { Circuits } from "./circuits";
import type { Turn } from "./types";
import { useSecondsLeft } from "./use-seconds-left";

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
