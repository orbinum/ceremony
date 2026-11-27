/**
 * A well-formed circuit name that is not an `Object.prototype` key (`constructor`): circuit names
 * index plain objects.
 */
import { CIRCUIT_NAME } from "../constants";

export const isCircuitName = (v: string): boolean =>
  CIRCUIT_NAME.test(v) && !(v in Object.prototype);
