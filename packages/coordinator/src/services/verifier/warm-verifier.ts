/**
 * Starts the verifier container ahead of a turn's first upload, so its start (about a minute) does
 * not count inside that job's deadline. Only the container is warmed; never throws.
 */
export async function warmVerifier(env: Env): Promise<void> {
  if (env.VERIFIER_URL || !env.VERIFIER_CONTAINER) return;
  try {
    await env.VERIFIER_CONTAINER.getByName(env.CEREMONY_ID).warm();
  } catch (error) {
    console.error("warm:", error);
  }
}
