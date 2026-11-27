/**
 * The attestation signs exactly what the page showed: the session's accepted contributions in
 * session order, plus the circuits it knows only by name; a stale receipt, one with other hashes
 * or an extra contribution, or an empty session is never signed. The receipt file names the
 * ceremony and the session.
 */
import {
  type AttestationPayload,
  type AttestedContribution,
  type Receipt,
} from "@orbinum-ceremony/core";
import { describe, expect, it, vi } from "vitest";
import type { Me } from "../../src/api";
import { attestSession, receiptFileName, type Shown, StaleReceipt } from "../../src/attestation";
import type { Wallet } from "../../src/wallets";
import { CIRCUIT_NAMES } from "../support";

const me: Me = {
  ceremonyId: "testnet-rehearsal-9",
  githubId: 42,
  login: "octocat",
  linked: { scheme: "eip712", account: "0xabc", linkedAt: 0, changeRefusal: null },
};
const CLIENT = { name: "test", version: "0.0.0", commit: "abcdef0" };

function receipt(): Receipt {
  const records = CIRCUIT_NAMES.map((circuit, i) => ({
    type: "contribution",
    seq: 3,
    circuit,
    index: i + 1,
    input_sha256: "11".repeat(32),
    output_sha256: "22".repeat(32),
    contribution_hash: "33".repeat(64),
    identity: { github_id: me.githubId },
  }));
  return { ceremony_id: me.ceremonyId, anchor: {} as never, seq: 3, records: records as never };
}

const shownOf = (r: Receipt) => ({
  accepted: r.records.map((x) => {
    const { circuit, index, input_sha256, output_sha256, contribution_hash } =
      x as unknown as AttestedContribution;
    return { circuit, index, input_sha256, output_sha256, contribution_hash };
  }),
  earlier: [],
});

const wallet = (): Wallet => ({
  scheme: "eip712",
  account: "0xabc",
  walletId: "io.metamask",
  name: "MetaMask",
  signLink: vi.fn<Wallet["signLink"]>(),
  signAttestation: vi.fn<Wallet["signAttestation"]>(async () => "0xsignature"),
});

async function attestAgainst(served: Receipt, shown: Shown) {
  const attest = vi.fn<(p: AttestationPayload, s: string) => Promise<unknown>>();
  const w = wallet();
  const result = await attestSession(
    { getReceipt: async () => served, attest },
    me,
    w,
    3,
    CLIENT,
    shown,
  ).catch((e: unknown) => e);
  return { result, signed: w.signAttestation, attest };
}

describe("attestSession", () => {
  it("signs the session's accepted contributions, in session order, and records it", async () => {
    const attest = vi.fn<(p: AttestationPayload, s: string) => Promise<unknown>>(async () => ({
      ok: true,
    }));
    const w = wallet();
    const payload = await attestSession(
      { getReceipt: async () => receipt(), attest },
      me,
      w,
      3,
      CLIENT,
      shownOf(receipt()),
    );

    expect(payload).toMatchObject({
      ceremony_id: me.ceremonyId,
      github_id: 42,
      account: "0xabc",
      seq: 3,
    });
    expect(payload.contributions.map((c) => c.circuit)).toEqual([...CIRCUIT_NAMES]);
    expect(payload.client).toEqual(CLIENT);
    expect(w.signAttestation).toHaveBeenCalledWith(payload);
    expect(attest).toHaveBeenCalledWith(payload, "0xsignature");
  });

  it("refuses to sign a session with nothing accepted", async () => {
    const empty = { ...receipt(), records: [] };
    const attest = vi.fn<(p: AttestationPayload, s: string) => Promise<unknown>>();
    await expect(
      attestSession({ getReceipt: async () => empty, attest }, me, wallet(), 3, CLIENT, {
        accepted: [],
        earlier: [],
      }),
    ).rejects.toThrow(/nothing to attest/);
    expect(attest).not.toHaveBeenCalled();
  });

  describe("signs only what the page showed", () => {
    it("refuses a stale receipt missing a contribution this run accepted", async () => {
      const full = receipt();
      const stale = { ...full, records: full.records.slice(1) };
      const { result: error, signed, attest } = await attestAgainst(stale, shownOf(full));
      expect(error).toBeInstanceOf(StaleReceipt);
      expect((error as Error).message).toMatch(/sign again/);
      expect(signed).not.toHaveBeenCalled();
      expect(attest).not.toHaveBeenCalled();
    });

    it("refuses a receipt whose hashes differ from the accepted ones", async () => {
      const shown = shownOf(receipt());
      shown.accepted[0] = { ...shown.accepted[0]!, contribution_hash: "44".repeat(64) };
      const { result: error, signed } = await attestAgainst(receipt(), shown);
      expect(error).toBeInstanceOf(StaleReceipt);
      expect(signed).not.toHaveBeenCalled();
    });

    it("refuses a receipt with a contribution the page did not show", async () => {
      const shown = shownOf(receipt());
      shown.accepted.pop();
      const { result: error, signed } = await attestAgainst(receipt(), shown);
      expect(error).toBeInstanceOf(StaleReceipt);
      expect(signed).not.toHaveBeenCalled();
    });

    it("signs circuits accepted earlier in the session, which the page knows by name", async () => {
      const shown = shownOf(receipt());
      const earlier = shown.accepted.shift()!;
      const { result, signed } = await attestAgainst(receipt(), {
        accepted: shown.accepted,
        earlier: [earlier.circuit],
      });
      expect(result).toMatchObject({ seq: 3 });
      expect(signed).toHaveBeenCalledOnce();
    });
  });
});

describe("receiptFileName", () => {
  it("names the ceremony and the session", () => {
    expect(receiptFileName(receipt())).toBe("testnet-rehearsal-9-session-3-receipt.json");
  });
});
