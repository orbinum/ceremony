/** Streaming snarkjs-compatible BLAKE2b-512: the ptau pin, csHash and h_k. */
import { blake2b } from "@noble/hashes/blake2.js";
import { streaming } from "./streaming";

export const createBlake2b512 = streaming(() => blake2b.create({ dkLen: 64 }));
