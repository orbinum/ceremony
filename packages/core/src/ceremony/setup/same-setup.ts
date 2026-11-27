/** Whether two setups are the same ceremony: configuring again with the same one is a no-op. */
import { canonicalJson } from "../../primitives/hashing";
import type { Setup } from "./types";

export const sameSetup = (a: Setup, b: Setup): boolean => canonicalJson(a) === canonicalJson(b);
