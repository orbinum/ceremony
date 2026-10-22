/** The job queue (COORDINATOR §5): serial, deduped (bounded), failures contained, stop bounded. */
import type { JobSpec } from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueue, SEEN_KEYS } from "../../../src/service";
import { jobSpec } from "../../support";

const spec = (attempt: number) =>
  jobSpec(attempt, { sha256: "11".repeat(32), csHash: "00".repeat(64) });

/** Resolvers for jobs that run until the test releases them. */
function gate() {
  const order: number[] = [];
  const release = new Map<number, () => void>();
  const run = (s: JobSpec) =>
    new Promise<void>((resolve) => {
      order.push(s.job.attempt);
      release.set(s.job.attempt, resolve);
    });
  return { order, release, run };
}

describe("job queue", () => {
  afterEach(() => vi.useRealTimers());

  it("runs jobs one at a time in arrival order, counting them as pending", async () => {
    const g = gate();
    const queue = createQueue(g.run, 60_000);
    expect([queue.submit(spec(1)), queue.submit(spec(2)), queue.submit(spec(3))]).toEqual([
      true,
      true,
      true,
    ]);
    expect(queue.pending()).toBe(3);
    await vi.waitFor(() => expect(g.order).toEqual([1]));
    g.release.get(1)?.();
    await vi.waitFor(() => expect(g.order).toEqual([1, 2]));
    expect(queue.pending()).toBe(2);
    g.release.get(2)?.();
    await vi.waitFor(() => expect(g.order).toEqual([1, 2, 3]));
    g.release.get(3)?.();
    await vi.waitFor(() => expect(queue.pending()).toBe(0));
  });

  it("logs a job that throws and still runs the next one", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const ran: number[] = [];
    const queue = createQueue(async (s) => {
      ran.push(s.job.attempt);
      if (s.job.attempt === 1) throw new Error("host failure");
    }, 60_000);
    queue.submit(spec(1));
    queue.submit(spec(2));
    await vi.waitFor(() => expect(queue.pending()).toBe(0));
    expect(ran).toEqual([1, 2]);
    expect(error).toHaveBeenCalledWith("job 1/shield/1: host failure");
  });

  it("takes each attempt once, remembering only the most recent keys", async () => {
    const queue = createQueue(async () => {}, 60_000);
    expect(queue.submit(spec(1))).toBe(true);
    expect(queue.submit(spec(1))).toBe(false);
    for (let a = 2; a <= SEEN_KEYS + 1; a++) queue.submit(spec(a));
    // Attempt 1 has left the window; the most recent one has not.
    expect(queue.submit(spec(SEEN_KEYS + 1))).toBe(false);
    expect(queue.submit(spec(1))).toBe(true);
    await vi.waitFor(() => expect(queue.pending()).toBe(0));
  });

  it("calls a job wedged once it outlives its bound", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const g = gate();
    const queue = createQueue(g.run, 1_000);
    queue.submit(spec(1));
    await vi.waitFor(() => expect(g.order).toEqual([1]));
    expect(queue.wedged()).toBe(false);
    vi.setSystemTime(Date.now() + 1_001);
    expect(queue.wedged()).toBe(true);
    g.release.get(1)?.();
    await vi.waitFor(() => expect(queue.wedged()).toBe(false));
  });

  it("stops: drops jobs not started and waits, bounded, for the one in flight", async () => {
    const g = gate();
    const queue = createQueue(g.run, 60_000);
    queue.submit(spec(1));
    queue.submit(spec(2));
    await vi.waitFor(() => expect(g.order).toEqual([1]));
    expect(await queue.stop(50)).toBe(false);
    const drained = queue.stop(500);
    g.release.get(1)?.();
    expect(await drained).toBe(true);
    expect(g.order).toEqual([1]);
    expect(queue.pending()).toBe(0);
  });
});
