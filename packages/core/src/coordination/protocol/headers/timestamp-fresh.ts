/** Whether a request timestamp (epoch ms, as the header carries it) is within the skew of `now`. */
import { REQUEST_AUTH } from "../../../config";

export const timestampFresh = (timestamp: string, now: number): boolean =>
  Math.abs(now - Number(timestamp)) <= REQUEST_AUTH.skewMs;
