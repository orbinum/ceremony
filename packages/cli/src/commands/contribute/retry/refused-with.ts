/** Whether `error` is the coordinator's refusal with error code `code`. */
import { CoordinatorRefusal } from "../../../io";

export const refusedWith = (error: unknown, code: string) =>
  error instanceof CoordinatorRefusal && error.code === code;
