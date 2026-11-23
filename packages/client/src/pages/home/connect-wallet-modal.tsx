/**
 * The wallet dialog: the wallets this browser offers in three families (Substrate, Solana, EVM),
 * one at a time; then, for an extension or a Solana wallet, one of its accounts. It hands back the
 * connected wallet; what to sign with it is the caller's.
 */
import { useState } from "react";
import { useDetectedWallets } from "../../hooks";
import { Button, Modal, Notice } from "../../ui";
import {
  connectEvm,
  type Family,
  solanaAccounts,
  substrateAccounts,
  type Wallet,
  type WalletAccount,
  type WalletOption,
} from "../../wallets";
import { errorText } from "./text";

const FAMILIES: { key: Family; label: string; hint: string }[] = [
  {
    key: "substrate",
    label: "Substrate",
    hint: "Native Orbinum accounts: Talisman, SubWallet (sr25519, or ed25519 for a Ledger).",
  },
  { key: "solana", label: "Solana", hint: "Your Solana account, as an ed25519 Orbinum account." },
  { key: "evm", label: "EVM", hint: "Ethereum-style accounts: MetaMask and other EVM wallets." },
];

const INSTALL: Record<Family, { name: string; url: string }[]> = {
  substrate: [
    { name: "Talisman", url: "https://talisman.xyz/download" },
    { name: "SubWallet", url: "https://www.subwallet.app/download.html" },
  ],
  solana: [{ name: "Phantom", url: "https://phantom.com/download" }],
  evm: [{ name: "MetaMask", url: "https://metamask.io/download/" }],
};

/** EVM wallets per page: browsers with many extensions announce a dozen or more. */
const PER_PAGE = 4;

/** The wallet's announced logo, or its initials when it announced none (as in the Hub). */
function Icon({ name, src }: { name: string; src: string | undefined }) {
  return (
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden border border-border bg-surface">
      {src ? (
        <img
          src={src}
          alt=""
          className="h-5 w-5 object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span className="text-[10px] font-black text-accent">{name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

function Row(props: {
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
      <Icon name={props.title} src={props.icon} />
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

export function ConnectWalletModal(props: {
  title: string;
  /** Only these families (the linked account's), or all three. */
  families?: Family[];
  onClose: () => void;
  /** What to do with the connected wallet (link it, sign with it); its error stays in the dialog. */
  onConnected: (wallet: Wallet) => Promise<void>;
}) {
  const { wallets, recheck } = useDetectedWallets();
  const [tab, setTab] = useState<Family | null>(null);
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<{ option: WalletOption; accounts: WalletAccount[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await step();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const finish = (wallet: Wallet) =>
    run(async () => {
      await props.onConnected(wallet);
      props.onClose();
    });
  const pick = (option: WalletOption) =>
    option.family === "evm"
      ? void run(async () => {
          await props.onConnected(await connectEvm(option));
          props.onClose();
        })
      : void run(async () =>
          setPicked({
            option,
            accounts: await (option.family === "solana"
              ? solanaAccounts(option)
              : substrateAccounts(option)),
          }),
        );

  const families = FAMILIES.filter((f) => !props.families || props.families.includes(f.key));
  const countOf = (key: Family) => wallets.filter((w) => w.family === key).length;
  const shown = families.filter((f) => f.key === "evm" || countOf(f.key) > 0);
  const tabs = shown.length > 0 ? shown : families;
  const active = tabs.find((f) => f.key === tab) ?? tabs[0];
  const options = wallets.filter((w) => w.family === active?.key);
  const pages = Math.max(1, Math.ceil(options.length / PER_PAGE));
  const current = Math.min(page, pages - 1);
  const listed =
    active?.key === "evm" ? options.slice(current * PER_PAGE, (current + 1) * PER_PAGE) : options;

  return (
    <Modal title={props.title} onClose={props.onClose}>
      {error !== undefined && <Notice tone="error">{errorText(error)}</Notice>}

      {picked ? (
        <div className="space-y-2">
          <p className="text-muted">Pick the {picked.option.name} account to use:</p>
          {picked.accounts.length === 0 && (
            <Notice tone="info">
              {picked.option.name} shared no account the ceremony can use (sr25519 or ed25519).
            </Notice>
          )}
          {picked.accounts.map((a) => (
            <Row
              key={a.address}
              icon={picked.option.icon}
              title={a.name ?? "Unnamed"}
              detail={`${a.scheme} · ${a.address}`}
              action="Use"
              disabled={busy}
              onClick={() => void finish(a.connect())}
            />
          ))}
          <Button variant="secondary" disabled={busy} onClick={() => setPicked(null)}>
            Back
          </Button>
        </div>
      ) : (
        <>
          {tabs.length > 1 && (
            <div role="tablist" className="grid grid-flow-col auto-cols-fr border border-border">
              {tabs.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active?.key === f.key}
                  onClick={() => setTab(f.key)}
                  className={`py-3 text-[10px] font-medium uppercase tracking-widest transition-colors sm:py-2 ${
                    active?.key === f.key
                      ? "bg-accent text-bg"
                      : "text-muted hover:bg-overlay-hover hover:text-text"
                  }`}
                >
                  {f.label}
                  {countOf(f.key) > 0 && (
                    <span className="ml-1.5 opacity-60">{countOf(f.key)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {active && <p className="text-xs text-muted">{active.hint}</p>}
          <div role="tabpanel" className="space-y-2">
            {listed.map((o) => (
              <Row
                key={o.id}
                icon={o.icon}
                title={o.name}
                detail="Detected in this browser"
                action="Connect"
                disabled={busy}
                onClick={() => pick(o)}
              />
            ))}
            {listed.length === 0 && active && (
              <Notice tone="info">
                No {active.label} wallet found in this browser. Install one, then check again:{" "}
                {INSTALL[active.key].map((w, i) => (
                  <span key={w.name}>
                    {i > 0 && ", "}
                    <a href={w.url} target="_blank" rel="noreferrer" className="underline">
                      {w.name}
                    </a>
                  </span>
                ))}
                .
              </Notice>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Button variant="secondary" disabled={busy} onClick={recheck}>
              Check again
            </Button>
            {active?.key === "evm" && pages > 1 && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Button
                  variant="secondary"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                >
                  ‹
                </Button>
                {current + 1} / {pages}
                <Button
                  variant="secondary"
                  disabled={current === pages - 1}
                  onClick={() => setPage(current + 1)}
                >
                  ›
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
