/**
 * Dark or light, as in the Hub: the system's preference until one is picked here, then that one,
 * kept in this browser (the system's without storage, in private mode). Applied before the first
 * render, so the page does not flash the other theme.
 */
import { applyTheme } from "./apply-theme";
import { THEME_KEY } from "./constants";
import type { Theme } from "./types";

function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {}
  return "system";
}

export const applyStoredTheme = () => applyTheme(storedTheme());
