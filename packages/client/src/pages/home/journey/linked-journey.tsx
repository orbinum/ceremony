/**
 * The five steps for a signed-in account with a linked wallet: each is done, current or upcoming
 * from what the coordinator (the account's slot) and the turn say, and only the current one asks
 * for anything. The turn's state belongs here, shared by the contribute and sign steps; when a
 * turn ends, the slot and the account are read again.
 */
import { CEREMONY_LAYOUT } from "@orbinum-ceremony/core";
import { type Config, getSlot, leaveQueue, type Me } from "../../../api";
import { usePoll, useTurn } from "../../../hooks";
import { Step, type StepState } from "../../../ui";
import { CliOption, ContributeStep, QueueStep, SignStep, WalletStep } from "../steps";
import { accountLine, STEP_ABOUT, STEP_TITLES } from "../text";
import { useTurnTitle } from "./use-turn-title";

export function LinkedJourney(props: { me: Me; config: Config | undefined; reloadMe: () => void }) {
  const { me, reloadMe } = props;
  const slotPoll = usePoll(getSlot, 5_000);
  const slot = slotPoll.data;
  const turn = useTurn(me, () => {
    slotPoll.reload();
    reloadMe();
  });
  const kind = turn.state.kind;
  const session = slot?.slot ?? null;
  const contributed = me.linked?.changeRefusal === "already-linked";
  const turning = kind === "running" || kind === "failed" || (session !== null && kind === "idle");
  const signing = kind === "signing" || kind === "done";
  const finished = kind === "done" || (contributed && session === null && kind === "idle");
  useTurnTitle(session !== null && !session.claimed && kind === "idle");

  const states: StepState[] = [
    "done",
    "done",
    finished || turning || signing ? "done" : "current",
    finished || signing ? "done" : turning ? "current" : "upcoming",
    finished ? "done" : kind === "signing" ? "current" : "upcoming",
  ];
  const linked = me.linked;
  return (
    <ol>
      <Step n={1} title={STEP_TITLES[0]} state="done" summary={`Signed in as @${me.login}`} />
      <Step
        n={2}
        title={STEP_TITLES[1]}
        state="done"
        summary={linked && accountLine(linked.scheme, linked.account)}
      >
        <WalletStep me={me} onLinked={reloadMe} />
      </Step>
      <Step
        n={3}
        title={STEP_TITLES[2]}
        state={states[2] as StepState}
        summary={states[2] === "done" ? "Your turn came." : STEP_ABOUT[2]}
      >
        {states[2] === "current" && slot && (
          <>
            <QueueStep
              slot={slot}
              error={slotPoll.error}
              reload={slotPoll.reload}
              siteKey={props.config?.turnstileSiteKey}
            />
            {slot.phase === "OPEN" && <CliOption />}
          </>
        )}
      </Step>
      <Step
        n={4}
        title={STEP_TITLES[3]}
        state={states[3] as StepState}
        summary={states[3] === "done" ? "Your contribution was verified." : STEP_ABOUT[3]}
      >
        {states[3] === "current" && slot && (
          <ContributeStep
            turn={turn}
            slot={slot}
            onSkip={async () => {
              await leaveQueue();
              slotPoll.reload();
            }}
          />
        )}
      </Step>
      <Step
        n={5}
        title={STEP_TITLES[4]}
        state={states[4] as StepState}
        summary={
          finished && kind !== "done" ? (
            <>
              Your contribution is recorded in the{" "}
              <a
                className="underline hover:text-accent"
                href={`/artifacts/${CEREMONY_LAYOUT.transcript}`}
              >
                transcript
              </a>
              . Thank you.
            </>
          ) : (
            STEP_ABOUT[4]
          )
        }
        last
      >
        {signing && <SignStep turn={turn} me={me} />}
      </Step>
    </ol>
  );
}
