/**
 * The turn around the contributions: a claim whose answer was lost still counts, ending waits out
 * a verification in flight, and the heartbeat loses the turn on a refusal, not on one network
 * failure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/api";
import { claim, finish, keepAlive } from "../../../src/contribution";

const refusal = (code: ConstructorParameters<typeof ApiError>[1], status = 409) =>
  new ApiError(status, code, code);
const instant = async () => {};

describe("claim", () => {
  it("counts a turn already claimed (an earlier answer that was lost)", async () => {
    await expect(
      claim({ claimTurn: async () => Promise.reject(refusal("already-claimed")) }, instant),
    ).resolves.toBeUndefined();
  });

  it("passes any other refusal on", async () => {
    await expect(
      claim({ claimTurn: async () => Promise.reject(refusal("not-your-slot")) }, instant),
    ).rejects.toThrow(ApiError);
  });
});

describe("finish", () => {
  it("waits while a verification is in flight", async () => {
    const finishSession = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(refusal("busy"))
      .mockRejectedValueOnce(refusal("busy"))
      .mockResolvedValueOnce({ ok: true });
    await finish({ finishSession }, instant);
    expect(finishSession).toHaveBeenCalledTimes(3);
  });

  it("takes a turn that is already over as ended", async () => {
    const finishSession = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(refusal("not-your-slot"));
    await finish({ finishSession }, instant);
    expect(finishSession).toHaveBeenCalledTimes(1);
  });
});

describe("keepAlive", () => {
  afterEach(() => vi.useRealTimers());

  it("beats at once and on every interval", async () => {
    vi.useFakeTimers();
    const heartbeat = vi.fn<() => Promise<unknown>>().mockResolvedValue({ ok: true });
    const heart = keepAlive({ heartbeat }, 1000);
    await vi.advanceTimersByTimeAsync(3000);
    heart.stop();
    expect(heartbeat).toHaveBeenCalledTimes(4);
    expect(heart.lost()).toBeNull();
  });

  it("loses the turn on a refusal, not on one network failure", async () => {
    vi.useFakeTimers();
    const heartbeat = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockRejectedValueOnce(refusal("not-your-slot"));
    const heart = keepAlive({ heartbeat }, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(heart.lost()).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(heart.lost()?.message).toMatch(/your turn ended/);
    heart.stop();
  });
});
