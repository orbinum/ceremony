/** Rate-limit bindings as tests replace them: counted per key, with no real time window. */

/** A limiter allowing `limit` calls per key, and the keys it saw. */
export function countingLimiter(limit: number) {
  const counts = new Map<string, number>();
  const binding = {
    limit: async ({ key }: { key: string }) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= limit };
    },
  } as unknown as RateLimit;
  return { binding, counts };
}

/** A limiter that never refuses: bounds are tested without the limits in the way. */
export const UNLIMITED = { limit: async () => ({ success: true }) } as unknown as RateLimit;
