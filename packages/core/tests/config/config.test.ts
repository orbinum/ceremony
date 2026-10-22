/** The pinned configuration is self-consistent. SPEC §1–2, §4.2, §5. */
import { describe, expect, it } from "vitest";
import {
  CIRCUIT_ORDER,
  CIRCUITS,
  DRAND,
  LOOPBACK_HOSTS,
  MIN_BEACON_DELAY_SECONDS,
  PTAU,
  QUEUE_RULES,
  REPORT_RESERVE_MS,
  VERIFIER_TIMEOUT_MS,
  VERIFY_DEADLINE_MS,
} from "../../src/config";

describe("config", () => {
  it("pins the ptau as a 512-bit hex hash", () => {
    expect(PTAU.blake2b512).toMatch(/^[0-9a-f]{128}$/);
  });

  it("fits every circuit in the ptau", () => {
    for (const c of Object.values(CIRCUITS))
      expect(c.constraints).toBeLessThan(PTAU.maxConstraints);
  });

  it("orders every circuit exactly once, smallest first", () => {
    expect(CIRCUIT_ORDER.toSorted()).toEqual(Object.keys(CIRCUITS).toSorted());
    const sizes = CIRCUIT_ORDER.map((n) => CIRCUITS[n].constraints);
    expect(sizes).toEqual(sizes.toSorted((a, b) => a - b));
  });

  it("issues ceremony keys as a new on-chain version", () => {
    for (const c of Object.values(CIRCUITS)) expect(c.ceremonyVersion).toBe(c.devVersion + 1);
  });

  it("pins drand quicknet", () => {
    expect(DRAND.chainHash).toMatch(/^[0-9a-f]{64}$/);
    expect(DRAND.periodSeconds).toBe(3);
  });

  it("fits the verifier's bound and its report inside the verify deadline", () => {
    expect(VERIFIER_TIMEOUT_MS.max + REPORT_RESERVE_MS).toBeLessThan(VERIFY_DEADLINE_MS);
    expect(QUEUE_RULES.verifyDeadlineMs).toBe(VERIFY_DEADLINE_MS);
  });

  it("puts every beacon after the last possible acceptance outside local", () => {
    expect(MIN_BEACON_DELAY_SECONDS.testnet * 1000).toBeGreaterThanOrEqual(VERIFY_DEADLINE_MS);
    expect(MIN_BEACON_DELAY_SECONDS.mainnet).toBe(86_400);
  });

  it("names only loopback hosts as loopback", () => {
    expect(LOOPBACK_HOSTS).toEqual(["localhost", "127.0.0.1", "[::1]"]);
  });
});
