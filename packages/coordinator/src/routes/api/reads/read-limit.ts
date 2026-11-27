/** The rate limit of public reads: no identity, so per client network. */
import { byNetwork, rateLimit } from "../../../middleware";

export const readLimit = rateLimit("READ_LIMIT", byNetwork);
