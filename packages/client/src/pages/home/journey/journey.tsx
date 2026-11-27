/**
 * How to contribute, as five steps: sign in, link a wallet, join the line, contribute, sign. For
 * whoever is on the page: signed out, signed in, or linked (`LinkedJourney`). `me` undefined and
 * `announced` undefined are still loading: step 1 shows a placeholder until both are known, so it
 * never offers a sign-in that the next answer takes back.
 */
import type { Config, Me } from "../../../api";
import { Skeleton, Step } from "../../../ui";
import { SignIn } from "../sign-in";
import { WalletStep } from "../steps";
import { STEP_ABOUT, STEP_TITLES } from "../text";
import { LinkedJourney } from "./linked-journey";

export function Journey(props: {
  me: Me | null | undefined;
  config: Config | undefined;
  announced: boolean | undefined;
  reloadMe: () => void;
}) {
  const { me } = props;
  if (me?.linked) return <LinkedJourney me={me} config={props.config} reloadMe={props.reloadMe} />;
  const loading = me === undefined;
  return (
    <ol>
      <Step
        n={1}
        title={STEP_TITLES[0]}
        state={me ? "done" : "current"}
        summary={me ? `Signed in as @${me.login}` : STEP_ABOUT[0]}
      >
        {loading ? (
          <Skeleton label="Loading your session" />
        ) : (
          !me && <SignIn announced={props.announced} />
        )}
      </Step>
      <Step
        n={2}
        title={STEP_TITLES[1]}
        state={me ? "current" : "upcoming"}
        summary={STEP_ABOUT[1]}
      >
        {me && <WalletStep me={me} onLinked={props.reloadMe} />}
      </Step>
      {STEP_TITLES.slice(2).map((title, i) => (
        <Step
          key={title}
          n={i + 3}
          title={title}
          state="upcoming"
          summary={STEP_ABOUT[i + 2]}
          last={i === 2}
        />
      ))}
    </ol>
  );
}
