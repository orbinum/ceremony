/** A 401 as the error the run reports, `TokenRefused`: the token, not the coordinator, is the problem. */
import { CoordinatorRefusal } from "../../../io";
import { TokenRefused } from "./token-refused";

export const tokenChecked = (error: unknown) =>
  error instanceof CoordinatorRefusal && error.status === 401
    ? new TokenRefused("the CLI token was refused (expired?): create a new one in the browser")
    : error;
