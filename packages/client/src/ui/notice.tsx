/** A one-line message: an error or a piece of information. */
import type { ReactNode } from "react";

export function Notice({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  const look =
    tone === "error"
      ? "bg-error-mix border-error-mix text-error"
      : "bg-surface border-border text-text";
  return <p className={`wrap-break-word border p-3 text-xs ${look}`}>{children}</p>;
}
