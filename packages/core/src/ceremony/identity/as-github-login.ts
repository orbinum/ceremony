/** A GitHub login, as the identity fields of links, attestations and records carry it. */
import { asString, GITHUB_LOGIN } from "../../primitives/schema";

export const asGithubLogin = (v: unknown, p: string): string => asString(v, p, 39, GITHUB_LOGIN);
