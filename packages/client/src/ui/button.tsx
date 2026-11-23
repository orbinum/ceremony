/** A button as in the Hub: primary (filled with the accent) or secondary (outlined); square. */
import type { ReactNode } from "react";

export function Button(props: {
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  /** Full width on a phone (a step's main action), its own width from sm up. */
  wide?: boolean;
  children: ReactNode;
}) {
  const look = props.variant === "secondary" ? "btn-ghost font-medium" : "btn-primary font-bold";
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${look} ${props.wide ? "w-full py-3 sm:w-auto sm:py-2" : "py-2"} px-4 text-xs disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {props.children}
    </button>
  );
}
