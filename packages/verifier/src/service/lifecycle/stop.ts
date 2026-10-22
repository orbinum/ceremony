/** A draining shutdown (COORDINATOR §5): the job in flight may finish, within a bound. */
import type { Server } from "node:http";
import { terminateIsolated } from "../../isolate";
import { errorMessage } from "../../text";
import type { Inputs } from "../inputs";
import type { JobQueue } from "../jobs";

/**
 * Stops taking connections, drops the jobs not started, waits up to `drainMs` for the one in
 * flight and then kills its snarkjs child (its job ends as `crashed` → `infra`), and removes the
 * staged copies.
 */
export async function drain(
  server: Server,
  queue: JobQueue,
  inputs: Inputs,
  drainMs: number,
): Promise<void> {
  server.close();
  server.closeIdleConnections();
  if (!(await queue.stop(drainMs))) {
    console.error("verifier: the job in flight did not finish in time; stopping it");
    terminateIsolated();
  }
  await inputs.stage.cleanup().catch((e: unknown) => console.error(errorMessage(e)));
}
