/** Whether the page shows the light theme now, picked or the system's. */
export const showsLight = () =>
  document.documentElement.dataset.theme === "light" ||
  (document.documentElement.dataset.theme !== "dark" &&
    window.matchMedia("(prefers-color-scheme: light)").matches);
