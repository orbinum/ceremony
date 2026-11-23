/**
 * Dark or light, as in the Hub: the system's preference until one is picked here, then that one
 * (kept in this browser). `data-theme` on <html> forces it (styles/tokens.css).
 */
type Theme = "dark" | "light" | "system";

const KEY = "theme";

function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    // no storage (private mode): the system's preference
  }
  return "system";
}

function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Before the first render, so the page does not flash the other theme. */
export const applyStoredTheme = () => applyTheme(storedTheme());

/** Whether the page shows the light theme now (picked, or the system's). */
export const showsLight = () =>
  document.documentElement.dataset.theme === "light" ||
  (document.documentElement.dataset.theme !== "dark" &&
    window.matchMedia("(prefers-color-scheme: light)").matches);

/** Picks a theme and keeps it in this browser. */
export function pickTheme(theme: "dark" | "light") {
  applyTheme(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // not kept: this page still shows it
  }
}
