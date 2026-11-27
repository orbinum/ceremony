/** A value loaded now, then every `everyMs` while the page is open, and on demand. */
import { useEffect, useState } from "react";

export function usePoll<T>(load: () => Promise<T>, everyMs: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let live = true;
    const run = () =>
      load().then(
        (v) => live && (setData(v), setError(undefined)),
        (e: unknown) => live && setError(e),
      );
    void run();
    const timer = setInterval(run, everyMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [load, everyMs]);

  const reload = () =>
    void load().then(
      (v) => (setData(v), setError(undefined)),
      (e: unknown) => setError(e),
    );
  return { data, error, reload };
}
