/**
 * Picks a theme and keeps it in this browser; without storage it is not kept, and this page still
 * shows it.
 */
import { applyTheme } from "./apply-theme";
import { THEME_KEY } from "./constants";

export function pickTheme(theme: "dark" | "light") {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}
