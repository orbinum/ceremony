/**
 * Solana wallets through the Wallet Standard: listed with their logos, read as Orbinum ed25519
 * accounts, signing core's message text bare (verifiable by that account), and reconnected for
 * the attestation.
 */
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, signatureVerify } from "@polkadot/util-crypto";
import { sr25519Message } from "@orbinum-ceremony/core";
import { beforeAll, describe, expect, it } from "vitest";
import { listSolanaWallets, reconnect, solanaAccounts } from "../../../src/wallets";
import { fakeBrowser, fakeSolanaWallet } from "../../support";

const PHANTOM = { id: "solana:phantom", name: "Phantom", family: "solana" } as const;

describe("Solana wallets (Wallet Standard)", () => {
  let pair: ReturnType<Keyring["addFromUri"]>;
  beforeAll(async () => {
    await cryptoWaitReady();
    pair = new Keyring({ type: "ed25519", ss58Format: 42 }).addFromUri("//Phantom");
  });

  it("lists the wallets that register, with the logo each registers", () => {
    const { window } = fakeBrowser();
    fakeSolanaWallet(window, "Phantom", pair, "data:image/svg+xml,p");
    fakeSolanaWallet(window, "Solflare", pair, "https://wallet.example/s.png");
    expect(listSolanaWallets()).toEqual([
      { id: "solana:phantom", name: "Phantom", family: "solana", icon: "data:image/svg+xml,p" },
      {
        id: "solana:solflare",
        name: "Solflare",
        family: "solana",
        icon: "https://wallet.example/s.png",
      },
    ]);
  });

  it("reads the wallet's key as an Orbinum ed25519 account", async () => {
    const { window } = fakeBrowser();
    fakeSolanaWallet(window, "Phantom", pair);
    const [account] = await solanaAccounts(PHANTOM);
    expect(account).toMatchObject({ address: pair.address, scheme: "ed25519", name: "Phantom 1" });
  });

  it("signs core's message text bare, verifiable as ed25519 by that account", async () => {
    const { window } = fakeBrowser();
    fakeSolanaWallet(window, "Phantom", pair);
    const [account] = await solanaAccounts(PHANTOM);
    const wallet = account!.connect();
    const payload = {
      ceremony_id: "c",
      github_id: 1,
      github_login: "octocat",
      account: pair.address,
      nonce: "ab".repeat(32),
      issued_at: 0,
    };
    const signature = await wallet.signLink(payload);
    const result = signatureVerify(sr25519Message("link", payload), signature, pair.address);
    expect([result.isValid, result.crypto, result.isWrapped]).toEqual([true, "ed25519", false]);
  });

  it("reconnects the linked Solana account for the attestation", async () => {
    const { window } = fakeBrowser();
    fakeSolanaWallet(window, "Phantom", pair);
    const wallet = await reconnect({ scheme: "ed25519", account: pair.address });
    expect([wallet.walletId, wallet.account]).toEqual(["solana:phantom", pair.address]);
  });
});
