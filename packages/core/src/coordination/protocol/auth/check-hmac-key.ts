/** Throws unless a shared request-auth key is usable (at least `MIN_KEY_BYTES` bytes). */
import { keyBytes } from "../../../primitives/hashing";
import { HMAC_KEY_LABEL } from "../constants";

export const checkHmacKey = (key: string): void => void keyBytes(key, HMAC_KEY_LABEL);
