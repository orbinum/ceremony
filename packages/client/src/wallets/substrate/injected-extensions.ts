/** The Substrate extensions this browser injected (`window.injectedWeb3`), by id. */
import type { Extensions } from "../types";

export const injectedExtensions = (): Extensions =>
  (typeof window === "undefined"
    ? undefined
    : (window as { injectedWeb3?: Extensions }).injectedWeb3) ?? {};
