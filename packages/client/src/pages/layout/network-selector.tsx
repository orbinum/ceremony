/** The network a visitor is on, and the way to the other one: the header's dropdown, sm and up. */
import { useRef, useState } from "react";
import type { Config } from "../../api";
import { useDismiss } from "../../hooks";
import { NETWORK_LABEL } from "./constants";
import { NetworkOptions } from "./network-options";

export function NetworkSelector({ network }: { network: Config["network"] | undefined }) {
  const [open, setOpen] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismiss(open, setOpen, area, trigger);

  if (!network) return null;
  return (
    <div className="relative" ref={area}>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Network: ${NETWORK_LABEL[network]}`}
        className="inline-flex h-8 items-center gap-1.5 border border-border bg-surface px-2.5 text-xs text-text transition-colors hover:bg-overlay-hover"
      >
        {NETWORK_LABEL[network]}
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Ceremony network"
          className="absolute top-full right-0 z-50 mt-1 min-w-40 border border-border bg-bg py-1 shadow-lg"
        >
          <NetworkOptions network={network} onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
