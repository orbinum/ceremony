/**
 * Reconnecting the linked wallet for the attestation: the only one of its kind, else the one
 * remembered at link time, else the user picks; never another account than the linked one.
 */
import { describe, expect, it } from "vitest";
import { ChooseWallet, reconnect, rememberWallet } from "../../src/wallets";
import { fakeBrowser, fakeProvider } from "../support";

const LINKED = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
const OTHER = "0x" + "11".repeat(20);

describe("reconnecting the linked wallet", () => {
  it("uses the only wallet of the linked kind", async () => {
    const { announce } = fakeBrowser();
    announce("io.metamask", "MetaMask", fakeProvider(LINKED).provider);
    const wallet = await reconnect({ scheme: "eip712", account: LINKED });
    expect(wallet.walletId).toBe("io.metamask");
  });

  it("uses the wallet remembered at link time among several", async () => {
    const { announce } = fakeBrowser();
    announce("io.metamask", "MetaMask", fakeProvider(OTHER).provider);
    announce("io.rabby", "Rabby", fakeProvider(LINKED).provider);
    rememberWallet("eip712", "io.rabby");
    const wallet = await reconnect({ scheme: "eip712", account: LINKED });
    expect(wallet.walletId).toBe("io.rabby");
  });

  it("asks which one when several could hold it and none is remembered", async () => {
    const { announce } = fakeBrowser();
    announce("io.metamask", "MetaMask", fakeProvider(OTHER).provider);
    announce("io.rabby", "Rabby", fakeProvider(LINKED).provider);
    await expect(reconnect({ scheme: "eip712", account: LINKED })).rejects.toThrow(ChooseWallet);
    const picked = await reconnect({ scheme: "eip712", account: LINKED }, "io.rabby");
    expect(picked.account).toBe(LINKED);
  });

  it("refuses another account than the linked one", async () => {
    const { announce } = fakeBrowser();
    announce("io.metamask", "MetaMask", fakeProvider(OTHER).provider);
    await expect(reconnect({ scheme: "eip712", account: LINKED })).rejects.toThrow(
      /Select the linked account/,
    );
  });

  it("says so when no wallet of the linked kind is here", async () => {
    fakeBrowser();
    await expect(reconnect({ scheme: "eip712", account: LINKED })).rejects.toThrow(
      /not available here/,
    );
  });
});
