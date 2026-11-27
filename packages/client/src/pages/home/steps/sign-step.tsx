/**
 * Step 5: sign the accepted contributions with the linked wallet, then the receipt. Several
 * wallets could hold the linked account: the wallet dialog asks which, until dismissed.
 */
import { useState } from "react";
import type { Me } from "../../../api";
import { saveReceipt } from "../../../attestation";
import { Button, Notice } from "../../../ui";
import { ChooseWallet, familiesOf } from "../../../wallets";
import { ConnectWalletModal } from "../wallet-dialog";
import { errorText } from "../text";
import type { Turn } from "./types";

export function SignStep({ turn, me }: { turn: Turn; me: Me }) {
  const { state, sign, skip } = turn;
  const [dismissed, setDismissed] = useState(false);

  if (state.kind === "done") {
    const { receipt } = state;
    return (
      <>
        <div className="border border-success-mix bg-success-mix p-4">
          <p className="font-sans text-base font-bold text-success">Thank you for contributing.</p>
          <p className="mt-1 text-xs text-text">
            {state.attested
              ? `Session #${state.seq} is recorded and signed with your wallet.`
              : `Session #${state.seq} has ended; its accepted contributions are recorded, unsigned.`}
          </p>
        </div>
        {receipt && (
          <Button wide variant="secondary" onClick={() => saveReceipt(receipt)}>
            Download the receipt
          </Button>
        )}
      </>
    );
  }

  if (state.kind !== "signing") return null;
  return (
    <>
      <p>
        Sign what you contributed with your linked wallet. The signature attributes it to you in the
        public transcript; it sends no transaction and costs nothing.
      </p>
      <ul className="divide-y divide-border border border-border text-xs">
        {state.accepted.map((a) => (
          <li key={a.circuit} className="flex items-center justify-between gap-4 px-3 py-2.5">
            <span className="shrink-0 font-medium text-text">
              {a.circuit} <span className="text-muted">#{a.index}</span>
            </span>
            <span className="min-w-0 truncate text-muted">{a.contributionHash.slice(0, 24)}…</span>
          </li>
        ))}
        {state.earlier.map((c) => (
          <li key={c} className="flex justify-between gap-4 px-3 py-2.5">
            <span className="font-medium text-text">{c}</span>
            <span className="text-muted">accepted earlier in this session</span>
          </li>
        ))}
      </ul>
      {state.error instanceof ChooseWallet && me.linked && !dismissed && (
        <ConnectWalletModal
          title="Pick your linked wallet"
          families={familiesOf(me.linked.scheme)}
          onClose={() => setDismissed(true)}
          onConnected={(wallet) => sign(wallet)}
        />
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          wide
          disabled={state.busy}
          onClick={() => {
            setDismissed(false);
            void sign();
          }}
        >
          Sign with my wallet
        </Button>
        <Button wide variant="secondary" disabled={state.busy} onClick={() => void skip()}>
          Finish without signing
        </Button>
      </div>
      {state.error !== undefined && !(state.error instanceof ChooseWallet) && (
        <Notice tone="error">{errorText(state.error)}</Notice>
      )}
    </>
  );
}
