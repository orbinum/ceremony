/**
 * The network a visitor is on, and the way to the other one. Each network's ceremony is its own
 * deployment on its own site (its own Worker, storage and keys), so picking another one goes to
 * that site. A dropdown in the header from sm up; a plain list inside the phone menu.
 */
import { useRef, useState } from "react";
import type { Config } from "../../api";
import { useDismiss } from "../../hooks";

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

/** Another network is another site: its own sign-in, wallet link and line. */
const go = (n: Network, current: Config["network"]) => {
  if (n !== current) window.location.assign(NETWORKS[n].site);
};

/** Every network as a row: the current one marked, one not open yet disabled with "Soon". */
function Options(props: {
  network: Config["network"];
  onPick: () => void;
  /** Rows of the phone menu: taller, to tap. */
  roomy?: boolean;
}) {
  return (Object.keys(NETWORKS) as Network[]).map((n) => {
    const { label, available } = NETWORKS[n];
    const selected = n === props.network;
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
          props.onPick();
          go(n, props.network);
        }}
        className={`flex w-full items-center gap-2 px-3 text-left text-xs transition-colors ${
          props.roomy ? "h-11" : "h-8"
        } ${look}`}
      >
        <span className="w-3 shrink-0 text-accent" aria-hidden="true">
          {selected ? "✓" : ""}
        </span>
        {label}
        {!available && <span className="ml-auto text-[10px] uppercase tracking-widest">Soon</span>}
      </button>
    );
  });
}

/** The header's dropdown (sm and up). */
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
        aria-label={`Network: ${LABEL[network]}`}
        className="inline-flex h-8 items-center gap-1.5 border border-border bg-surface px-2.5 text-xs text-text transition-colors hover:bg-overlay-hover"
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
          className="absolute top-full right-0 z-50 mt-1 min-w-40 border border-border bg-bg py-1 shadow-lg"
        >
          <Options network={network} onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** The networks as a list inside the phone menu. */
export function NetworkList(props: { network: Config["network"] | undefined; onPick: () => void }) {
  if (!props.network) return null;
  return (
    <div role="listbox" aria-label="Ceremony network">
      <Options network={props.network} onPick={props.onPick} roomy />
    </div>
  );
}
