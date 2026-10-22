/**
 * The verifier service process (COORDINATOR §5): config and startup checks, then the HTTP server
 * and the job queue until SIGTERM/SIGINT, which drains the job in flight.
 */
import { errorMessage } from "../text";
import { loadConfig } from "./config";
import { createVerifierServer } from "./http";
import { createQueue, JOB_DEADLINE_MS, jobSinkOf, runJob } from "./jobs";
import { drain, prepare } from "./lifecycle";

/** How long shutdown waits for the job in flight before killing its snarkjs child. */
const DRAIN_MS = 30_000;

process.on("unhandledRejection", (error) =>
  console.error(`unhandled rejection: ${errorMessage(error)}`),
);
// State after an uncaught exception is unknown: exit, the supervisor restarts (COORDINATOR §5).
process.on("uncaughtException", (error) => {
  console.error(`uncaught exception: ${errorMessage(error)}`);
  process.exit(1);
});

let config;
let inputs;
try {
  config = loadConfig();
  inputs = await prepare(config);
} catch (error) {
  console.error(`verifier: ${errorMessage(error)}`);
  process.exit(1);
}
const pinned = inputs;
const ceremonyId = pinned.init.ceremony_id;
const queue = createQueue((spec) => runJob({ config, inputs: pinned }, spec), JOB_DEADLINE_MS);
const server = createVerifierServer(
  { hmacKey: config.hmacKey, ceremonyId },
  jobSinkOf(pinned, queue),
);
server.once("error", (error) => {
  console.error(`verifier: ${errorMessage(error)}`);
  process.exit(1);
});
server.listen(config.port, config.host, () => {
  console.log(
    `verifier ${config.version} listening on ${config.host}:${config.port} for ${ceremonyId}`,
  );
});

async function shutdown(signal: string): Promise<void> {
  console.log(`verifier: ${signal}, draining`);
  await drain(server, queue, pinned, DRAIN_MS);
  process.exit(0);
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown(signal));
}
