/**
 * A parent process for `run.test.ts`: runs the echo worker isolated and prints its answer, so a
 * test can start it from any working directory.
 */
import { join } from "node:path";
import { runIsolated } from "../../../src/isolate";

const answer = await runIsolated(
  join(import.meta.dirname, "..", "workers", "echo.ts"),
  { value: 21 },
  { timeoutMs: 20_000, maxRssBytes: 2 * 1024 ** 3 },
);
console.log(JSON.stringify(answer));
