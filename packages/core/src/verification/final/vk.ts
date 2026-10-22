/** The verification key hash the chain stores: `0x ‖ blake2_256(packed VK)`. SPEC §2.6 #4, §6.4. */
import { blake2b256Hex } from "../../primitives/hashing";

/** `vk_hash` of a verification key packed as `pallet-zk-verifier` stores it. */
export const vkHashOf = (packed: Uint8Array): string => `0x${blake2b256Hex(packed)}`;
