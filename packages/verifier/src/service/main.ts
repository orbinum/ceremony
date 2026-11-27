/**
 * The verifier service process: config and startup checks, then the HTTP server and the job queue
 * until SIGTERM/SIGINT, which drains the job in flight for up to 30 s before killing its snarkjs
 * child. After an uncaught exception the state is unknown, so the process exits and the supervisor
 * restarts it.
 */
import { errorMessage } from "../text";
import { loadConfig } from "./config";
import { createVerifierServer } from "./http";
import { createQueue, JOB_DEADLINE_MS, jobSinkOf, runJob } from "./jobs";
import { drain, prepare } from "./lifecycle";

const DRAIN_MS = 30_000;

process.on("unhandledRejection", (error) =>
  console.error(`unhandled rejection: ${errorMessage(error)}`),
);
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
const queue = createQueue(
  (spec, receivedAt) => runJob({ config, inputs: pinned }, spec, receivedAt),
  JOB_DEADLINE_MS,
);
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
