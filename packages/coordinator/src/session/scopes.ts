/**
 * The token scopes of the sign-in credentials, each bound to this deployment's ceremony: a session
 * cookie, an OAuth attempt and a CLI token never pass for one another, nor for one of another
 * ceremony.
 */
export const sessionScope = (env: Env) => `session:${env.CEREMONY_ID}`;

export const stateScope = (env: Env) => `oauth-state:${env.CEREMONY_ID}`;

export const cliScope = (env: Env) => `cli:${env.CEREMONY_ID}`;
