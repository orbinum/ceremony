/** One step of a guided flow: its number (a check once done), title, a line about it, and its content. */
import type { ReactNode } from "react";

export type StepState = "done" | "current" | "upcoming";

export function Step(props: {
  n: number;
  title: string;
  state: StepState;
  /** One line under the title: what the step is, or what it settled. */
  summary?: ReactNode;
  last?: boolean;
  children?: ReactNode;
}) {
  const { state } = props;
  const marker =
    state === "done"
      ? "border-success-mix bg-success-mix text-success"
      : state === "current"
        ? "border-accent bg-accent text-bg"
        : "border-border text-muted";
  return (
    <li
      className={`relative pb-6 sm:pb-8 ${props.last ? "pb-0 sm:pb-0" : ""}`}
      aria-current={state === "current" ? "step" : undefined}
    >
      {!props.last && (
        <span
          aria-hidden="true"
          className="absolute top-8 bottom-0 left-[13px] hidden w-px bg-border sm:block"
        />
      )}
      <div className="flex gap-3 sm:gap-4">
        <span
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center border text-xs font-bold ${marker}`}
        >
          {state === "done" ? (
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              aria-label="done"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            props.n
          )}
        </span>
        <div className={`min-w-0 flex-1 ${state === "upcoming" ? "opacity-60" : ""}`}>
          <h3 className="font-sans text-base font-bold tracking-tight text-accent">
            {props.title}
          </h3>
          {props.summary && <p className="mt-0.5 text-xs text-muted">{props.summary}</p>}
        </div>
      </div>
      {/* Full width on a phone; beside the rail from sm up. */}
      {props.children && (
        <div className="mt-4 space-y-3 text-sm text-text sm:pl-11">{props.children}</div>
      )}
    </li>
  );
}
