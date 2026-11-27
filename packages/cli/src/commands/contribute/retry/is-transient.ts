/** A failure worth retrying: the network, a timeout, a rate limit, or the coordinator's fault. */
import { CoordinatorRefusal } from "../../../io";

export const isTransient = (error: unknown) =>
  !(error instanceof CoordinatorRefusal) || error.status === 429 || error.status >= 500;
