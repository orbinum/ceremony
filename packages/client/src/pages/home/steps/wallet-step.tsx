/**
 * Step 2: link a wallet to the signed-in GitHub account (current), or the linked one with a way to
 * change it (done). The user picks a wallet and account in the wallet dialog, then a coordinator
 * nonce, the payload naming this ceremony and account, and that wallet's signature. One GitHub
 * account, one wallet: it can be changed (signing again with the new one) until a contribution
 * names it, and not during the account's own turn.
 */
import { buildLinkPayload } from "@orbinum-ceremony/core";
import { useState } from "react";
import { linkNonce, linkWallet, type Me } from "../../../api";
import { Button } from "../../../ui";
import { rememberWallet, type Wallet } from "../../../wallets";
import { ConnectWalletModal } from "../wallet-dialog";

async function link(me: Me, wallet: Wallet) {
  const { nonce } = await linkNonce();
  const payload = buildLinkPayload({
    ceremonyId: me.ceremonyId,
    githubId: me.githubId,
    githubLogin: me.login,
    account: wallet.account,
    nonce,
    now: Date.now(),
  });
  await linkWallet(wallet.scheme, payload, await wallet.signLink(payload));
  rememberWallet(wallet.scheme, wallet.walletId);
}

const FIXED: Record<"already-linked" | "busy", string> = {
  "already-linked": "Fixed: your contributions in the transcript name it.",
  busy: "It cannot change during your turn.",
};

export function WalletStep({ me, onLinked }: { me: Me; onLinked: () => void }) {
  const [open, setOpen] = useState(false);
  const dialog = (title: string) =>
    open && (
      <ConnectWalletModal
        title={title}
        onClose={() => setOpen(false)}
        onConnected={async (wallet) => {
          await link(me, wallet);
          setOpen(false);
          onLinked();
        }}
      />
    );

  if (me.linked) {
    const { changeRefusal } = me.linked;
    return changeRefusal ? (
      <p className="text-xs text-muted">{FIXED[changeRefusal]}</p>
    ) : (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="py-1 text-xs text-muted underline underline-offset-2 hover:text-accent"
        >
          Change wallet
        </button>
        {dialog("Change wallet")}
      </>
    );
  }

  return (
    <>
      <p>
        Pick the wallet that will sign your contribution: a Substrate, Solana or EVM wallet. You
        sign a short message to prove you control it; no transaction, no fee. You can change it
        until your first contribution is recorded.
      </p>
      <Button wide onClick={() => setOpen(true)}>
        Connect wallet
      </Button>
      {dialog("Connect wallet")}
    </>
  );
}
