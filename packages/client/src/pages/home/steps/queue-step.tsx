/**
 * The line's step: join it, wait for the turn, or leave. `siteKey` is the deployment's Turnstile
 * site key (`null`: no check, a local run; `undefined`: not known yet). Joining waits for a solve;
 * each attempt spends its token and gets a fresh widget.
 */
import { QUEUE_RULES } from "@orbinum-ceremony/core";
import { useCallback, useState } from "react";
import { joinQueue, leaveQueue, type Slot } from "../../../api";
import { Button, Notice, Turnstile } from "../../../ui";
import { errorText } from "../text";

const CLAIM_S = QUEUE_RULES.claimWindowMs / 1000;

export function QueueStep(props: {
  slot: Slot | undefined;
  error: unknown;
  reload: () => void;
  siteKey: string | null | undefined;
}) {
  const { slot, siteKey } = props;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>();
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const onToken = useCallback((t: string | null) => setToken(t), []);

  const act = async (step: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(undefined);
    try {
      await step();
      props.reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    try {
      await joinQueue(token ?? undefined);
    } finally {
      setToken(null);
      setRound((r) => r + 1);
    }
  };

  const errors = (
    <>
      {props.error !== undefined && <Notice tone="error">{errorText(props.error)}</Notice>}
      {actionError !== undefined && <Notice tone="error">{errorText(actionError)}</Notice>}
    </>
  );

  if (slot?.position != null) {
    return (
      <>
        <div className="flex items-center gap-3 border border-border bg-surface p-4 sm:gap-4">
          <span className="font-sans text-3xl font-black text-accent">#{slot.position}</span>
          <p className="text-xs text-muted">
            {slot.position === 1 ? "You are next." : "Your place in line."} Stay on this page: when
            your turn comes you have {CLAIM_S} seconds to start it, and this tab's title will tell
            you.
          </p>
        </div>
        <Button wide variant="secondary" disabled={busy} onClick={() => void act(leaveQueue)}>
          Leave the line
        </Button>
        {errors}
      </>
    );
  }

  if (slot && slot.phase !== "OPEN") {
    return (
      <>
        <Notice tone="info">
          {slot.phase === "SCHEDULED"
            ? "The line opens when the ceremony opens. Come back then."
            : slot.phase === "PAUSED"
              ? "The ceremony is paused. The line reopens shortly."
              : "The ceremony is no longer taking contributions."}
        </Notice>
        {errors}
      </>
    );
  }

  const checked = siteKey === null || (siteKey !== undefined && token !== null);
  return (
    <>
      <p>
        Contributions run one at a time. Join the line and keep this page open: when your turn comes
        you have {CLAIM_S} seconds to start it.
      </p>
      {siteKey && <Turnstile key={round} siteKey={siteKey} action="join" onToken={onToken} />}
      <Button wide disabled={busy || !slot || !checked} onClick={() => void act(join)}>
        Join the line
      </Button>
      {errors}
    </>
  );
}
