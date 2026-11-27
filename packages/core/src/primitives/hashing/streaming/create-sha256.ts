/** Streaming SHA-256, for file integrity without buffering whole files. */
import { sha256 } from "@noble/hashes/sha2.js";
import { streaming } from "./streaming";

export const createSha256 = streaming(() => sha256.create());
