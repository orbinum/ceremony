/**
 * Releases snarkjs's curve, which it caches on `globalThis` with worker threads that keep the
 * process alive.
 */
export async function releaseSnarkjs(): Promise<void> {
  const cached = (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128;
  await cached?.terminate();
}
