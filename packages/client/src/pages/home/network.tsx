/**
 * The network dropdown of the header, beside the theme switch. Each network's ceremony is its own deployment
 * on its own site (its own Worker, storage and keys), so picking another one goes to that site.
 */
import { useEffect, useRef, useState } from "react";
import type { Config } from "../../api";

type Network = "mainnet" | "testnet";

/** The ceremonies there are, and where. ponytail: mainnet off until its deployment exists. */
const NETWORKS: Record<Network, { label: string; site: string; available: boolean }> = {
  mainnet: { label: "Mainnet", site: "https://ceremony.orbinum.network", available: false },
  testnet: { label: "Testnet", site: "https://ceremony.testnet.orbinum.network", available: true },
};

const LABEL: Record<NonNullable<Config["network"]>, string> = {
  mainnet: "Mainnet",
  testnet: "Testnet",
  local: "Local",
};

export function NetworkSelector({ network }: { network: Config["network"] | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!network) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 border border-border bg-surface px-2 py-1 text-[11px] text-text transition-colors hover:bg-overlay-hover"
      >
        {LABEL[network]}
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
          className="absolute top-full right-0 z-50 mt-1 min-w-36 border border-border bg-bg py-0.5 shadow-lg"
        >
          {(Object.keys(NETWORKS) as Network[]).map((n) => {
            const { label, site, available } = NETWORKS[n];
            const selected = n === network;
            const look = !available
              ? "cursor-not-allowed text-muted opacity-50"
              : selected
                ? "text-accent"
                : "text-muted hover:bg-overlay-hover hover:text-text";
            return (
              <button
                key={n}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={!available}
                title={available ? undefined : `${label} opens soon`}
                onClick={() => {
                  setOpen(false);
                  // Another network is another site: its own sign-in, wallet link and line.
                  if (!selected) window.location.assign(site);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors sm:py-1.5 ${look}`}
              >
                {label}
                {!available && <span className="ml-auto text-[10px] uppercase">Soon</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
