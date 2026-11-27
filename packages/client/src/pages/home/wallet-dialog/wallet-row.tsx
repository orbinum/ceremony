/** One row of the wallet dialog: a wallet or an account, with what picking it does. */
import { WalletIcon } from "./wallet-icon";

export function WalletRow(props: {
  icon?: string;
  title: string;
  detail: string;
  action: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="flex w-full items-center gap-3 border border-border px-3 py-2.5 text-left transition-colors hover:border-muted hover:bg-overlay-hover disabled:opacity-40"
    >
      <WalletIcon name={props.title} src={props.icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{props.title}</span>
        <span className="block truncate font-mono text-xs text-muted">{props.detail}</span>
      </span>
      <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
        {props.action}
      </span>
    </button>
  );
}
