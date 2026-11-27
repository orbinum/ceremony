/** While it is this account's turn to start, the tab's title says so: the window is short. */
import { useEffect } from "react";

export function useTurnTitle(waiting: boolean) {
  useEffect(() => {
    if (!waiting) return;
    const previous = document.title;
    document.title = "● Your turn — start now";
    return () => {
      document.title = previous;
    };
  }, [waiting]);
}
