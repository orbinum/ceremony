/**
 * The verification key hash the chain stores: `0x ‖ blake2_256(packed VK)`, over the key packed as
 * `pallet-zk-verifier` stores it.
 */
import { blake2b256Hex } from "../../primitives/hashing";

export const vkHashOf = (packed: Uint8Array): string => `0x${blake2b256Hex(packed)}`;
