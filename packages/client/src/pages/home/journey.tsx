/**
 * How to contribute, as five steps (SPEC §4.1): sign in, link a wallet, join the line, contribute,
 * sign. Each step is done, current or upcoming from what the coordinator and the turn say; only
 * the current one asks for anything.
 */
import { CEREMONY_LAYOUT } from "@orbinum-ceremony/core";
import { useEffect } from "react";
import { type Config, getSlot, leaveQueue, type Me } from "../../api";
import { usePoll, useTurn } from "../../hooks";
import { Step, type StepState } from "../../ui";
import { CliOption } from "./cli";
import { QueueStep } from "./queue";
import { ContributeStep, SignStep } from "./turn";
import { shortAccount } from "./text";
import { WalletStep } from "./wallet";

const TITLES = [
  "Sign in with GitHub",
  "Link a wallet",
  "Join the line",
  "Contribute",
  "Sign and get your receipt",
] as const;

const ABOUT = [
  "Your GitHub account keeps the line fair: one contribution per person.",
  "It signs your contribution. No transaction, no fee.",
  "One contributor at a time; you wait your turn on this page.",
  "Your browser adds its randomness to the three circuits. A few minutes.",
  "Your wallet signs what you contributed, for the public record.",
] as const;

function SignIn() {
  return (
    <>
      <p>
        The account must be at least 30 days old, with a public repository, a follower, and five
        accounts it follows. No permission is requested.
      </p>
      {/* A full navigation: the coordinator redirects to GitHub and back. */}
      <a
        href="/auth/github"
        className="btn-primary block w-full px-4 py-3 text-center text-xs font-bold sm:inline-block sm:w-auto sm:py-2"
      >
        Sign in with GitHub
      </a>
    </>
  );
}

/** While it is this account's turn to start, the tab's title says so (the window is short). */
function useTurnTitle(waiting: boolean) {
  useEffect(() => {
    if (!waiting) return;
    const previous = document.title;
    document.title = "● Your turn — start now";
    return () => {
      document.title = previous;
    };
  }, [waiting]);
}

function Linked(props: { me: Me; config: Config | undefined; reloadMe: () => void }) {
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
      <Step n={1} title={TITLES[0]} state="done" summary={`Signed in as @${me.login}`} />
      <Step
        n={2}
        title={TITLES[1]}
        state="done"
        summary={linked && `${linked.scheme} · ${shortAccount(linked.account)}`}
      >
        <WalletStep me={me} onLinked={reloadMe} />
      </Step>
      <Step
        n={3}
        title={TITLES[2]}
        state={states[2] as StepState}
        summary={states[2] === "done" ? "Your turn came." : ABOUT[2]}
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
        title={TITLES[3]}
        state={states[3] as StepState}
        summary={states[3] === "done" ? "Your contribution was verified." : ABOUT[3]}
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
        title={TITLES[4]}
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
            ABOUT[4]
          )
        }
        last
      >
        {signing && <SignStep turn={turn} me={me} />}
      </Step>
    </ol>
  );
}

/** The five steps for whoever is on the page: signed out, signed in, or linked. */
export function Journey(props: {
  me: Me | null;
  config: Config | undefined;
  reloadMe: () => void;
}) {
  const { me } = props;
  if (me?.linked) return <Linked me={me} config={props.config} reloadMe={props.reloadMe} />;
  return (
    <ol>
      <Step
        n={1}
        title={TITLES[0]}
        state={me ? "done" : "current"}
        summary={me ? `Signed in as @${me.login}` : ABOUT[0]}
      >
        {!me && <SignIn />}
      </Step>
      <Step n={2} title={TITLES[1]} state={me ? "current" : "upcoming"} summary={ABOUT[1]}>
        {me && <WalletStep me={me} onLinked={props.reloadMe} />}
      </Step>
      {TITLES.slice(2).map((title, i) => (
        <Step
          key={title}
          n={i + 3}
          title={title}
          state="upcoming"
          summary={ABOUT[i + 2]}
          last={i === 2}
        />
      ))}
    </ol>
  );
}
