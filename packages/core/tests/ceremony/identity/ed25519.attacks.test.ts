/**
 * ed25519 wallet signatures follow one strict rule wherever they are checked (Worker, Node CLI,
 * browser): canonical encodings, a prime-order public key, a prime-order R. Without it, one secret
 * stands behind several account keys, a keyless "wallet" verifies anything, and two backends of the
 * same library disagree on a published record. SPEC §3.4.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToNumberLE, concatBytes, numberToBytesLE } from "@noble/curves/utils.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { u8aWrapBytes } from "@polkadot/util";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  accountKey,
  type LinkPayload,
  sr25519Message,
  ss58Address,
  verifyLink,
} from "../../../src/ceremony/identity";
import { utf8 } from "../../../src/primitives/encoding";

const { Point } = ed25519;
const L = Point.Fn.ORDER;
/** A point of order 8 (the torsion subgroup's generator). */
const T8 = Point.fromHex("c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a");
/** The identity point, and a non-canonical spelling of it (x = 0 with the sign bit set). */
const IDENTITY = Uint8Array.from([1, ...Array<number>(31).fill(0)]);
const IDENTITY_SIGNED = Uint8Array.from([1, ...Array<number>(30).fill(0), 0x80]);

const seed = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const key = ed25519.utils.getExtendedPublicKey(seed);

const link = (account: string): LinkPayload => ({
  ceremony_id: "unit-test-1",
  github_id: 7,
  github_login: "octocat",
  account,
  nonce: "ab".repeat(32),
  issued_at: 1_790_000_000,
});
const messageOf = (pk: Uint8Array) => utf8(sr25519Message("link", link(ss58Address(pk))));
const hashScalar = (...parts: Uint8Array[]) => bytesToNumberLE(sha512(concatBytes(...parts))) % L;
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/** Signs `msg` for the public key `pk` with secret scalar `a`, R = rB (+ an optional torsion). */
function sign(msg: Uint8Array, pk: Uint8Array, rTorsion?: InstanceType<typeof Point>): Uint8Array {
  const r = hashScalar(key.prefix, msg);
  const R = rTorsion ? Point.BASE.multiply(r).add(rTorsion) : Point.BASE.multiply(r);
  const k = hashScalar(R.toBytes(), pk, msg);
  return Uint8Array.from([...R.toBytes(), ...numberToBytesLE((r + k * key.scalar) % L, 32)]);
}

/** The crafted cases a lenient (ZIP-215, cofactored) verifier accepts. */
function cases() {
  const torsionPk = key.point.add(T8).toBytes();
  const honestPk = key.pointBytes;
  const mHonest = messageOf(honestPk);
  // R spelled non-canonically: k is computed over the canonical re-encoding a lenient verifier hashes.
  const k = hashScalar(IDENTITY, honestPk, mHonest);
  const crafted = Uint8Array.from([
    ...IDENTITY_SIGNED,
    ...numberToBytesLE((k * key.scalar) % L, 32),
  ]);
  return {
    "torsion-mixed key (A + T)": { pk: torsionPk, sig: sign(messageOf(torsionPk), torsionPk) },
    "small-order key (identity), R = O, S = 0": {
      pk: IDENTITY,
      sig: Uint8Array.from([...IDENTITY, ...Array<number>(32).fill(0)]),
    },
    "honest key, non-canonical small-order R": { pk: honestPk, sig: crafted },
    "honest key, torsion-mixed R": { pk: honestPk, sig: sign(mHonest, honestPk, T8) },
  };
}

describe("ed25519 strict rule", () => {
  beforeAll(async () => {
    await cryptoWaitReady();
  });

  it("an honest signature still verifies, bare and <Bytes>-wrapped", () => {
    const pk = key.pointBytes;
    const m = messageOf(pk);
    const account = ss58Address(pk);
    expect(verifyLink("ed25519", link(account), hex(ed25519.sign(m, seed)))).toBe(true);
    expect(verifyLink("ed25519", link(account), hex(ed25519.sign(u8aWrapBytes(m), seed)))).toBe(
      true,
    );
  });

  for (const [name, c] of Object.entries(cases())) {
    it(`refuses ${name}`, () => {
      expect(verifyLink("ed25519", link(ss58Address(c.pk)), hex(c.sig))).toBe(false);
    });
  }

  it("gives one secret one account key: torsion and small-order keys are not accounts", () => {
    expect(accountKey("ed25519", ss58Address(key.pointBytes))).toBe(`0x${hex(key.pointBytes)}`);
    expect(accountKey("ed25519", ss58Address(key.point.add(T8).toBytes()))).toBeNull();
    expect(accountKey("ed25519", ss58Address(IDENTITY))).toBeNull();
  });

  it("refuses the identity key for sr25519 too", () => {
    expect(accountKey("sr25519", ss58Address(new Uint8Array(32)))).toBeNull();
  });
});
