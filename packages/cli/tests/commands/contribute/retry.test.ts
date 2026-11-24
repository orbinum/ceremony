/** Retrying against the coordinator: only transient failures, and a refused token ends the run. */
import { describe, expect, it } from "vitest";
import {
  isTransient,
  refusedWith,
  retrying,
  sleep,
  TokenRefused,
  tokenChecked,
} from "../../../src/commands/contribute/retry";
import { CoordinatorRefusal } from "../../../src/io";

const refusal = (status: number, code?: string) => new CoordinatorRefusal("x", status, code);

describe("retrying", () => {
  it("counts the network, rate limits and the coordinator's faults as transient, nothing else", () => {
    expect(
      [new TypeError("fetch failed"), refusal(429), refusal(500), refusal(503)].map(isTransient),
    ).toEqual([true, true, true, true]);
    expect([refusal(400), refusal(401), refusal(403), refusal(409)].map(isTransient)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("turns a 401 into a refused token, and names a refusal by its code only", () => {
    expect(tokenChecked(refusal(401))).toBeInstanceOf(TokenRefused);
    expect(tokenChecked(refusal(403))).toBeInstanceOf(CoordinatorRefusal);
    expect(refusedWith(refusal(409, "busy"), "busy")).toBe(true);
    expect(refusedWith(new Error("busy"), "busy")).toBe(false);
  });

  it("gives up at once on a refusal, and reports a refused token as such", async () => {
    let calls = 0;
    const fail = (e: Error) => () => {
      calls += 1;
      return Promise.reject(e);
    };
    await expect(retrying(fail(refusal(409, "busy")))).rejects.toBeInstanceOf(CoordinatorRefusal);
    await expect(retrying(fail(refusal(401)))).rejects.toBeInstanceOf(TokenRefused);
    expect(calls).toBe(2);
  });

  it("stops waiting as soon as the run is interrupted", async () => {
    const abort = new AbortController();
    const waiting = sleep(60_000, abort.signal);
    abort.abort();
    await expect(waiting).rejects.toThrow("interrupted");
  });
});
