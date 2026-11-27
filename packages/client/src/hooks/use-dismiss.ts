/**
 * Closes a popup (a dropdown, the phone menu) the way people expect: a press outside it or Escape.
 * Escape also puts the focus back on what opened it, so a keyboard user is not left nowhere.
 * `setOpen` is the popup's state setter, stable across renders.
 */
import { type RefObject, useEffect } from "react";

export function useDismiss(
  open: boolean,
  setOpen: (open: boolean) => void,
  area: RefObject<HTMLElement | null>,
  trigger?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (area.current && !area.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger?.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, setOpen, area, trigger]);
}
