/** How the Worker reaches the ceremony's object: one per `CEREMONY_ID` of the deployment. */
export const ceremony = (env: Env) => env.CEREMONY.getByName(env.CEREMONY_ID);
