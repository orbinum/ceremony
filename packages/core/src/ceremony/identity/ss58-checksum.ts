/**
 * The two checksum bytes of an SS58 address body (prefix and key), computed without @polkadot so
 * the browser need not load it.
 */
import { fromHex, utf8 } from "../../primitives/encoding";
import { blake2b512Hex } from "../../primitives/hashing";

export const ss58Checksum = (body: Uint8Array) =>
  fromHex(blake2b512Hex(new Uint8Array([...utf8("SS58PRE"), ...body]))).slice(0, 2);
