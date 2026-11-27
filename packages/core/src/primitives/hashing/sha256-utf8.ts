/** SHA-256 of a string's UTF-8 bytes, lowercase hex: published text files and logs. */
import { utf8 } from "../encoding";
import { sha256Hex } from "./sha256-hex";

export const sha256Utf8 = (text: string): string => sha256Hex(utf8(text));
