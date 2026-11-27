/**
 * EVM wallets: EIP-55 checksums, EIP-6963 discovery (the first provider per rdns kept, a bare
 * `window.ethereum` named by its flag), signing through the picked wallet's own provider with the
 * checksummed address and the typed data as a JSON string, one access request on 4100, and a
 * declined signature worded for the page.
 */
import { describe, expect, it } from "vitest";
import {
  connectEvm,
  INJECTED,
  listEvmWallets,
  providerOf,
  toChecksumAddress,
  WalletError,
} from "../../../src/wallets";
import { fakeBrowser, fakeProvider } from "../../support";

const ACCOUNT = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
const PAYLOAD = {
  ceremony_id: "c",
  github_id: 1,
  github_login: "octocat",
  account: ACCOUNT,
  nonce: "ab".repeat(32),
  issued_at: 0,
};

describe("toChecksumAddress (EIP-55)", () => {
  it("writes the reference vectors", () => {
    for (const a of [
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
      "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
      "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
    ]) {
      expect(toChecksumAddress(a.toLowerCase())).toBe(a);
    }
  });

  it("refuses what is not an address", () => {
    expect(() => toChecksumAddress("0x1234")).toThrow(/not an EVM address/);
  });
});

describe("EVM wallets (EIP-6963)", () => {
  it("lists every announced wallet with its own name and logo", () => {
    const { announce } = fakeBrowser();
    announce("io.metamask", "MetaMask", fakeProvider(ACCOUNT).provider, "data:image/svg+xml,x");
    announce("io.rabby", "Rabby", fakeProvider(ACCOUNT).provider, "https://wallet.example/i.png");
    expect(listEvmWallets()).toEqual([
      { id: "io.metamask", name: "MetaMask", family: "evm", icon: "data:image/svg+xml,x" },
      { id: "io.rabby", name: "Rabby", family: "evm", icon: "https://wallet.example/i.png" },
    ]);
  });

  it("falls back to window.ethereum, named by its flag, when nothing announces", () => {
    const { window } = fakeBrowser();
    window.ethereum = fakeProvider(ACCOUNT, { isRabby: true }).provider;
    expect(listEvmWallets()).toEqual([{ id: INJECTED, name: "Rabby", family: "evm" }]);
  });

  it("signs through the picked wallet, not whichever owns window.ethereum", async () => {
    const { window, announce } = fakeBrowser();
    const metamask = fakeProvider(ACCOUNT);
    const other = fakeProvider("0x" + "11".repeat(20));
    window.ethereum = other.provider;
    announce("io.metamask", "MetaMask", metamask.provider);
    const wallet = await connectEvm({ id: "io.metamask", name: "MetaMask", family: "evm" });
    expect(wallet).toMatchObject({ account: ACCOUNT, walletId: "io.metamask", name: "MetaMask" });
    await wallet.signLink(PAYLOAD);
    const sign = metamask.calls.find((c) => c.method === "eth_signTypedData_v4");
    expect(sign?.params?.[0]).toBe(toChecksumAddress(ACCOUNT));
    expect(JSON.parse(sign?.params?.[1] as string).types.EIP712Domain).toBeDefined();
    expect(other.calls).toEqual([]);
  });

  it("asks a wallet that answers 4100 for access once, then signs", async () => {
    const { announce } = fakeBrowser();
    const metamask = fakeProvider(ACCOUNT);
    announce("io.metamask", "MetaMask", metamask.provider);
    const wallet = await connectEvm({ id: "io.metamask", name: "MetaMask", family: "evm" });
    metamask.failures.push({ code: 4100, message: "unauthorized" });
    await expect(wallet.signLink(PAYLOAD)).resolves.toBe(`0xsig-${ACCOUNT}`);
    expect(metamask.calls.map((c) => c.method)).toEqual([
      "eth_requestAccounts",
      "eth_signTypedData_v4",
      "eth_requestAccounts",
      "eth_signTypedData_v4",
    ]);
  });

  it("words a declined signature", async () => {
    const { announce } = fakeBrowser();
    const metamask = fakeProvider(ACCOUNT);
    announce("io.metamask", "MetaMask", metamask.provider);
    const wallet = await connectEvm({ id: "io.metamask", name: "MetaMask", family: "evm" });
    metamask.failures.push({ code: 4001, message: "User denied" });
    const error = await wallet.signLink(PAYLOAD).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletError);
    expect((error as Error).message).toMatch(/declined/);
  });

  it("keeps the first provider announced for an rdns, ignoring later ones with the same rdns", () => {
    const { announce } = fakeBrowser();
    const metamask = fakeProvider(ACCOUNT);
    const impostor = fakeProvider("0x" + "11".repeat(20));
    announce("io.metamask", "MetaMask", metamask.provider);
    expect(providerOf("io.metamask")).toBe(metamask.provider);
    announce("io.metamask", "Not MetaMask", impostor.provider);
    expect(providerOf("io.metamask")).toBe(metamask.provider);
    expect(listEvmWallets()).toEqual([
      { id: "io.metamask", name: "MetaMask", family: "evm", icon: undefined },
    ]);
  });

  it("refuses a wallet that has gone away", () => {
    fakeBrowser();
    expect(() => providerOf("io.metamask")).toThrow(/no longer available/);
  });
});
