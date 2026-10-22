/** A small, valid ceremony built only with core's own builders: the base every check test edits. */
import { TypedDataEncoder, Wallet } from "ethers";
import { buildAnnouncement, type CeremonyAnnouncement } from "../../src/ceremony/announcement";
import {
  type AttestationPayload,
  attestationTypedData,
  ethersTypedData,
  type Identity,
  linkPayloadOf,
  linkTypedData,
} from "../../src/ceremony/identity";
import { buildInit, type InitRecord } from "../../src/ceremony/init";
import {
  appendRecord,
  buildContributionRecord,
  type Chained,
  chainGenesis,
  type TranscriptRecord,
} from "../../src/ceremony/transcript";
import { PTAU } from "../../src/config";
import { serializeJson, utf8 } from "../../src/primitives/encoding";
import { sha256Hex } from "../../src/primitives/hashing";

export const ID = "unit-test-1";
export const OPEN = Date.parse("2026-10-01T00:00:00.000Z");
export const CLOSE = Date.parse("2026-10-02T00:00:00.000Z");
const COMMIT = "efe10bf3ef1d928c9c209fee4077750334410cfe";

/** n-th fake hash of `bytes` bytes (distinct per n). */
export const h = (n: number, bytes = 32) => n.toString(16).padStart(bytes * 2, "0");

export const INIT: InitRecord = buildInit({
  ceremonyId: ID,
  createdAt: "2026-09-30T00:00:00.000Z",
  circom: "2.2.3",
  circomlib: "2.0.5",
  circomFlags: ["--r1cs", "--O1"],
  source: { ref: "v0.16.0", commit: COMMIT },
  circuits: [
    {
      name: "shield",
      circuit_id: 3,
      ceremony_version: 2,
      r1cs_sha256: h(1),
      constraints: 736,
      public_signals: 3,
      wires: 741,
      domain_power: 10,
      genesis_sha256: h(100),
      cs_hash: h(7, 64),
    },
  ],
});
export const INIT_TEXT = serializeJson(INIT);

export const ANNOUNCEMENT: CeremonyAnnouncement = buildAnnouncement({
  ceremonyId: ID,
  network: "testnet",
  initSha256: sha256Hex(utf8(INIT_TEXT)),
  circuitsSource: { repo: "https://github.com/orbinum/circuits", tag: "v0.16.0", commit: COMMIT },
  minContributions: 2,
  open: new Date(OPEN),
  close: new Date(CLOSE),
  beaconDelaySeconds: 3600,
});
export const ANNOUNCEMENT_TEXT = serializeJson(ANNOUNCEMENT);
export const ANNOUNCEMENT_SHA256 = sha256Hex(utf8(ANNOUNCEMENT_TEXT));
export const GENESIS = chainGenesis(ID, ANNOUNCEMENT);

/** Contributor n's EVM wallet: a fixed test key, never a real wallet. */
export const walletOf = (n: number): Wallet => new Wallet(`0x${n.toString(16).padStart(64, "0")}`);

/** Signs typed data synchronously, as the wallet would. */
const signTyped = (n: number, typed: ReturnType<typeof ethersTypedData>) =>
  walletOf(n).signingKey.sign(TypedDataEncoder.hash(...typed)).serialized;

const contributors = new Map<string, Identity & { linkSignature: string }>();

/** Contributor n (GitHub id 100 + n): a linked EVM wallet with a real link signature. */
export function contributor(n: number, ceremonyId = ID): Identity & { linkSignature: string } {
  let c = contributors.get(`${ceremonyId}/${n}`);
  if (!c) {
    const identity: Identity = {
      github_id: 100 + n,
      github_login: n === 1 ? "alice" : `user-${n}`,
      account: walletOf(n).address,
      scheme: "eip712",
      nonce: h(1000 + n),
      issued_at: Math.floor(OPEN / 1000) - 3600,
    };
    const link = linkPayloadOf(ceremonyId, identity);
    const linkSignature = signTyped(n, ethersTypedData(linkTypedData(link)));
    contributors.set(`${ceremonyId}/${n}`, (c = { ...identity, linkSignature }));
  }
  return c;
}

/** Contributor n's signature of an attestation payload. */
export const signAttestation = (n: number, payload: AttestationPayload): string =>
  signTyped(n, ethersTypedData(attestationTypedData(payload)));

export const ALICE = contributor(1);

/**
 * Shield contribution `index` of session `seq`, chained from the previous output; by contributor
 * `index` unless `who` says otherwise.
 */
export const contribution = (
  index: number,
  seq = index,
  at = OPEN + index * 60_000,
  who = contributor(index),
) =>
  buildContributionRecord({
    ceremonyId: ID,
    seq,
    circuit: "shield",
    index,
    claimed: {
      inputSha256: index === 1 ? h(100) : h(100 + index - 1),
      outputSha256: h(100 + index),
      contributionHash: h(index, 64),
      method: "browser",
      client: { name: "client", version: "1.0.0", commit: "abc1234" },
    },
    verified: {
      contributionHash: h(index, 64),
      zkeyName: `contributor-${index}`,
      deltaAfter: h(200 + index, 64),
      logSha256: h(300 + index),
      verifierVersion: "0.1.0",
      snarkjsVersion: "0.7.6",
    },
    contributor: who,
    at: new Date(at).toISOString(),
  });

/** Chains records from the genesis. */
export function chain(records: readonly TranscriptRecord[], genesis = GENESIS): Chained[] {
  const out: Chained[] = [];
  for (const r of records) out.push(appendRecord(out, genesis, r));
  return out;
}

export { PTAU };

/** `INIT` with every pinned circuit, as a ceremony outside `local` must have. */
export const FULL_INIT: InitRecord = buildInit({
  ceremonyId: ID,
  createdAt: INIT.created_at,
  circom: INIT.tooling.circom,
  circomlib: INIT.tooling.circomlib,
  circomFlags: INIT.tooling.circom_flags,
  source: INIT.source,
  circuits: [
    ...INIT.circuits,
    {
      ...INIT.circuits[0]!,
      name: "unshield",
      circuit_id: 2,
      ceremony_version: 3,
      genesis_sha256: h(110),
    },
    {
      ...INIT.circuits[0]!,
      name: "transfer",
      circuit_id: 1,
      ceremony_version: 3,
      genesis_sha256: h(120),
    },
  ],
});

/** The texts a coordinator is configured with for a full-coverage `ANNOUNCEMENT` twin. */
export const SETUP_INPUT = (() => {
  const init = serializeJson(FULL_INIT);
  const announcement = serializeJson({ ...ANNOUNCEMENT, init_sha256: sha256Hex(utf8(init)) });
  return {
    announcement,
    init,
    genesisSizes: { shield: 1000, unshield: 1000, transfer: 1000 },
  };
})();
