/** The networks as a plain list inside the phone menu. */
import type { Config } from "../../api";
import { NetworkOptions } from "./network-options";

export function NetworkList(props: { network: Config["network"] | undefined; onPick: () => void }) {
  if (!props.network) return null;
  return (
    <div role="listbox" aria-label="Ceremony network">
      <NetworkOptions network={props.network} onPick={props.onPick} roomy />
    </div>
  );
}
