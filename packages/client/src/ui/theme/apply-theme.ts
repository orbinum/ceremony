/** Shows `theme`: `data-theme` on <html> forces it (styles/tokens.css); none follows the system. */
import type { Theme } from "./types";

export function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
