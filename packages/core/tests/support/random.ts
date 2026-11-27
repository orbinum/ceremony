/**
 * Fuzz randomness: a seeded PRNG (mulberry32), so runs are reproducible from their seed; an
 * integer pick in [0, n); and `ensure`, an invariant that fails the test with its message.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rand: () => number, n: number) => Math.floor(rand() * n);

export function ensure(condition: boolean, message: string): void {
  if (!condition) throw new Error(`invariant broken: ${message}`);
}
