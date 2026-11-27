/** Waits bounded in time: a regression fails with a named reason instead of hanging the suite. */

export async function within<T>(ms: number, what: string, promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: still pending after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

export async function until(ms: number, what: string, check: () => boolean): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`${what}: not true after ${ms} ms`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
