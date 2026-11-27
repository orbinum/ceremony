/** A link nonce exactly as the coordinator issued it: lowercase hex of the configured size. */
import { LINK_RULES } from "../../../config";
import { asHex } from "../../../primitives/schema";

export const asLinkNonce = (v: unknown, p: string): string => asHex(v, p, LINK_RULES.nonceBytes);
