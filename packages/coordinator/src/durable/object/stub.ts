/** How the Worker reaches the ceremony's object. */

/** The ceremony's object for this deployment: one per `CEREMONY_ID`. */
export const ceremony = (env: Env) => env.CEREMONY.getByName(env.CEREMONY_ID);
