/** δ of a final key against γ and the genesis δ. SPEC §2.6 #3. */
import { describe, expect, it } from "vitest";
import { blake2b256Hex } from "../../../src/primitives/hashing";
import { checkDelta, vkHashOf } from "../../../src/verification";

/** BN254 base field modulus. */
const Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

/** A snarkjs vk.json G2 point (affine, z = 1) whose x.c0 is `n`. */
const g2 = (n: string) => [
  [n, "1"],
  ["2", "3"],
  ["1", "0"],
];

describe("checkDelta", () => {
  it("accepts δ different from γ and from the genesis δ (genesis δ = γ = generator)", () => {
    expect(
      checkDelta({ vk_delta_2: g2("9"), vk_gamma_2: g2("5") }, { vk_delta_2: g2("5") }),
    ).toEqual([]);
  });

  it("rejects δ = γ (phase 2 skipped)", () => {
    expect(
      checkDelta({ vk_delta_2: g2("5"), vk_gamma_2: g2("5") }, { vk_delta_2: g2("7") }),
    ).toEqual(["δ = γ: phase 2 was skipped"]);
  });

  it("rejects a key with no contribution (δ = genesis δ)", () => {
    expect(
      checkDelta({ vk_delta_2: g2("7"), vk_gamma_2: g2("5") }, { vk_delta_2: g2("7") }),
    ).toEqual(["δ equals the genesis δ"]);
  });
});

describe("checkDelta against the same point written differently", () => {
  it.each([
    ["leading zeros", "05"],
    ["0x hex", "0x5"],
    ["an unreduced value x + Q", (5n + Q).toString()],
    ["a negative value", "-5"],
    ["a number instead of a string", 5 as unknown as string],
  ])("does not let δ = γ hide behind %s", (_, x) => {
    const res = checkDelta({ vk_delta_2: g2(x), vk_gamma_2: g2("5") }, { vk_delta_2: g2("7") });
    expect(res).toEqual(["vk_delta_2: not an affine G2 point"]);
  });

  it("rejects a projective point (z ≠ 1) instead of comparing it as affine", () => {
    const projective = [
      ["5", "1"],
      ["2", "3"],
      ["2", "0"],
    ];
    const res = checkDelta(
      { vk_delta_2: projective, vk_gamma_2: g2("5") },
      { vk_delta_2: g2("7") },
    );
    expect(res).toContain("vk_delta_2: not an affine G2 point");
  });
});

describe("checkDelta against missing inputs", () => {
  it.each([
    ["a missing δ", { vk_gamma_2: g2("5") }, { vk_delta_2: g2("7") }, "vk_delta_2"],
    ["a null δ", { vk_delta_2: null, vk_gamma_2: g2("5") }, { vk_delta_2: g2("7") }, "vk_delta_2"],
    ["a missing γ", { vk_delta_2: g2("9") }, { vk_delta_2: g2("7") }, "vk_gamma_2"],
    ["a missing genesis δ", { vk_delta_2: g2("9"), vk_gamma_2: g2("5") }, {}, "genesis vk_delta_2"],
  ])("fails closed on %s", (_, vk, genesis, field) => {
    expect(checkDelta(vk, genesis)).toEqual([`${field}: not an affine G2 point`]);
  });

  it("refuses a decimal longer than any field element before converting it", () => {
    const long = "9".repeat(78);
    const res = checkDelta({ vk_delta_2: g2(long), vk_gamma_2: g2("5") }, { vk_delta_2: g2("7") });
    expect(res).toEqual(["vk_delta_2: not an affine G2 point"]);
  });
});

describe("checkDelta reads canonical affine points only", () => {
  it("refuses a coordinate equal to q, and a projective point with z.c1 ≠ 0", () => {
    const atQ = [
      [Q.toString(), "1"],
      ["2", "3"],
      ["1", "0"],
    ];
    expect(checkDelta({ vk_delta_2: atQ, vk_gamma_2: g2("5") }, { vk_delta_2: g2("7") })).toEqual([
      "vk_delta_2: not an affine G2 point",
    ]);
    const projective = [
      ["9", "1"],
      ["2", "3"],
      ["1", "1"],
    ];
    expect(
      checkDelta({ vk_delta_2: projective, vk_gamma_2: g2("5") }, { vk_delta_2: g2("7") }),
    ).toEqual(["vk_delta_2: not an affine G2 point"]);
  });
});

describe("vkHashOf", () => {
  it("is 0x and the Substrate blake2_256 of the packed key", () => {
    const packed = new TextEncoder().encode("packed vk");
    expect(vkHashOf(packed)).toBe(`0x${blake2b256Hex(packed)}`);
    expect(vkHashOf(new Uint8Array())).toBe(
      "0x0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8",
    );
  });
});
