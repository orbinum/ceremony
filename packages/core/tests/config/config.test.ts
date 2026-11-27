/**
 * The pinned configuration is self-consistent: the ptau and drand pins are well formed, the
 * verifier's bound and report fit inside the verify deadline, and beacons fall after the last
 * possible acceptance.
 */
import { describe, expect, it } from "vitest";
import {
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
