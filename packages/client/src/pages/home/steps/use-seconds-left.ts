/** Seconds left until `deadline` (epoch ms), ticking every second; null without one. */
import { useEffect, useState } from "react";

export function useSecondsLeft(deadline: number | null): number | null {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}
