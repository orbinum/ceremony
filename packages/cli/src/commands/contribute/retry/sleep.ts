/** Waits `ms`, or rejects at once ("interrupted") if `signal` aborts. */

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("interrupted"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(new Error("interrupted"));
    };
    signal?.addEventListener("abort", stop, { once: true });
  });
}
