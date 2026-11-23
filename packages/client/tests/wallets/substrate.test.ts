import { fromHex, fromUtf8, sr25519Message } from "@orbinum-ceremony/core";
import { describe, expect, it, vi } from "vitest";
import {
  detectWallets,
  listSubstrateWallets,
  schemeOfAccount,
  substrateAccounts,
} from "../../src/wallets";
import { fakeBrowser, fakeProvider } from "../support";

const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const LEDGER = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";
const TALISMAN = { id: "talisman", name: "Talisman", family: "substrate" } as const;
const PAYLOAD = {
  ceremony_id: "c",
  github_id: 1,
  github_login: "octocat",
  account: ALICE,
  nonce: "ab".repeat(32),
  issued_at: 0,
};

/** An extension sharing `accounts`; records the payloads it signs. */
function extension(accounts: { address: string; name?: string; type?: string }[]) {
  const signed: { address: string; data: string }[] = [];
  const injected = {
    accounts: { get: async () => accounts },
    signer: {
      signRaw: async (raw: { address: string; data: string }) => {
        signed.push(raw);
        return { signature: "0xsig" };
      },
    },
  };
  return {
    enable: vi.fn<(dapp: string) => Promise<typeof injected>>(async () => injected),
    signed,
  };
}

describe("Substrate extensions", () => {
  it("lists Talisman and SubWallet first, with their logos, and keeps the id of others", () => {
    const { window } = fakeBrowser();
    window.injectedWeb3 = {
      "some-wallet": extension([]),
      "subwallet-js": extension([]),
      talisman: extension([]),
    };
    const listed = listSubstrateWallets();
    expect(listed.map((w) => [w.id, w.name])).toEqual([
      ["talisman", "Talisman"],
      ["subwallet-js", "SubWallet"],
      ["some-wallet", "some-wallet"],
    ]);
    // Nothing injected names a logo: it comes from the wallet's EIP-6963 announcement.
    expect(listed.map((w) => w.icon)).toEqual([undefined, undefined, undefined]);
  });

  it("takes the logo the same wallet announced as an EVM wallet", () => {
    const { window, announce } = fakeBrowser();
    window.injectedWeb3 = { talisman: extension([]) };
    announce("xyz.talisman", "Talisman", fakeProvider(ALICE).provider, "data:image/png;base64,x");
    expect(detectWallets().find((w) => w.family === "substrate")?.icon).toBe(
      "data:image/png;base64,x",
    );
  });

  it("signs with sr25519 or ed25519 accounts; never Ethereum or ecdsa ones", () => {
    expect(schemeOfAccount({ address: ALICE, type: "sr25519" })).toBe("sr25519");
    expect(schemeOfAccount({ address: ALICE })).toBe("sr25519");
    expect(schemeOfAccount({ address: LEDGER, type: "ed25519" })).toBe("ed25519");
    expect(schemeOfAccount({ address: ALICE, type: "ecdsa" })).toBeNull();
    expect(schemeOfAccount({ address: "0x" + "11".repeat(20), type: "ethereum" })).toBeNull();
    expect(schemeOfAccount({ address: "0x" + "11".repeat(20) })).toBeNull();
  });

  it("asks only the picked extension for access", async () => {
    const { window } = fakeBrowser();
    const talisman = extension([
      { address: ALICE, name: "Alice", type: "sr25519" },
      { address: LEDGER, name: "Ledger", type: "ed25519" },
      { address: "0x" + "11".repeat(20), type: "ethereum" },
    ]);
    const subwallet = extension([]);
    window.injectedWeb3 = { talisman, "subwallet-js": subwallet };
    const accounts = await substrateAccounts(TALISMAN);
    expect(accounts.map((a) => [a.address, a.name, a.scheme])).toEqual([
      [ALICE, "Alice", "sr25519"],
      [LEDGER, "Ledger", "ed25519"],
    ]);
    expect(talisman.enable).toHaveBeenCalledTimes(1);
    expect(subwallet.enable).not.toHaveBeenCalled();
  });

  it("signs core's exact message text as bytes, under the account's scheme", async () => {
    const { window } = fakeBrowser();
    const talisman = extension([{ address: ALICE, type: "sr25519" }]);
    window.injectedWeb3 = { talisman };
    const [account] = await substrateAccounts(TALISMAN);
    const wallet = account!.connect();
    expect(wallet).toMatchObject({ scheme: "sr25519", account: ALICE, walletId: "talisman" });
    await wallet.signLink(PAYLOAD);
    expect(talisman.signed[0]?.address).toBe(ALICE);
    expect(fromUtf8(fromHex(talisman.signed[0]?.data.slice(2) ?? ""))).toBe(
      sr25519Message("link", PAYLOAD),
    );
  });
});
