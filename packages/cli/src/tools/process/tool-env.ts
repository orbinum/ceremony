/**
 * The environment passed to every external tool: only what it needs to find itself and its temp
 * dir, so secrets in the operator's shell (an Access token) never reach it.
 */

const ENV_KEPT = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SystemRoot"] as const;

export const toolEnv = (env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv =>
  Object.fromEntries(ENV_KEPT.flatMap((k) => (env[k] === undefined ? [] : [[k, env[k]]])));
