/**
 * Leaves its pid where the test can find it, then spins: a blocked event loop, as a crafted input
 * that sends snarkjs into a tight loop would leave it.
 */
import { writeFileSync } from "node:fs";
import { serveOnce } from "../../../src/isolate";

serveOnce(async (task: { pidFile: string }) => {
  writeFileSync(task.pidFile, String(process.pid));
  for (;;) {
    // never answers
  }
});
