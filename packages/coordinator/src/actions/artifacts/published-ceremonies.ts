/** The ceremonies this network published, current one included. */
import { archivedCeremonies } from "../../storage";

export const publishedCeremonies = (env: Env) => archivedCeremonies(env);
