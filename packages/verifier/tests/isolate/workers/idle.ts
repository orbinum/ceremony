/** Leaves its pid, then waits forever with a live timer: only its exit paths can end it. */
import { writeFileSync } from "node:fs";
import { serveOnce } from "../../../src/isolate";

serveOnce(async (task: { pidFile: string }) => {
  writeFileSync(task.pidFile, String(process.pid));
  setInterval(() => {}, 1000);
  return new Promise(() => {});
});
