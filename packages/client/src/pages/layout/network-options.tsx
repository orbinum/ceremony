/**
 * Every network as a row: the current one marked, one not open yet disabled with "Soon"; `roomy`
 * rows are taller, to tap in the phone menu. Another network is another site, with its own
 * sign-in, wallet link and line, so picking one goes there.
 */
import type { Config } from "../../api";
import { NETWORKS } from "./constants";
import type { Network } from "./types";

const go = (n: Network, current: Config["network"]) => {
  if (n !== current) window.location.assign(NETWORKS[n].site);
};

export function NetworkOptions(props: {
  network: Config["network"];
  onPick: () => void;
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
