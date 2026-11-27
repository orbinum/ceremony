/** A failure worth trying again: the network, a rate limit, or the coordinator's own fault. */
import { ApiError } from "./api-error";

export const isTransient = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 429 || error.status >= 500;
