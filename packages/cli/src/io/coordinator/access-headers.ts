/**
 * The Cloudflare Access service token from the environment, as headers, for an `https:` origin
 * only: over plaintext (a local coordinator) it would reach whatever listens on that port.
 */

export function accessHeaders(origin: string, env: NodeJS.ProcessEnv): Record<string, string> {
  const id = env.CF_ACCESS_CLIENT_ID;
  const secret = env.CF_ACCESS_CLIENT_SECRET;
  if (new URL(origin).protocol !== "https:" || !id || !secret) return {};
  return { "cf-access-client-id": id, "cf-access-client-secret": secret };
}
