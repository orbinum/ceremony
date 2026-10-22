/** A promise a test settles itself: to hold a bucket call in flight until it says so. */

/** A pending promise and the function that resolves it. */
export function deferred(): { promise: Promise<void>; release: () => void } {
  const settle: { release?: () => void } = {};
  const promise = new Promise<void>((resolve) => {
    settle.release = resolve;
  });
  return { promise, release: () => settle.release?.() };
}
