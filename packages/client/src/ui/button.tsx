/**
 * A button as in the Hub: primary (filled with the accent) or secondary (outlined); square. `wide`:
 * full width on a phone (a step's main action), its own width from sm up; `compact`: the 32 px
 * height of the header's controls.
 */
import type { ReactNode } from "react";

export function Button(props: {
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  wide?: boolean;
  size?: "regular" | "compact";
  children: ReactNode;
}) {
  const look = props.variant === "secondary" ? "btn-ghost font-medium" : "btn-primary font-bold";
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${look} ${
        props.size === "compact"
          ? "inline-flex h-8 items-center px-3"
          : `${props.wide ? "w-full py-3 sm:w-auto sm:py-2" : "py-2"} px-4`
      } text-xs disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {props.children}
    </button>
  );
}
