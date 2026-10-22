/** Answers with the task doubled and its own pid. */
import { serveOnce } from "../../../src/isolate";

serveOnce(async (task: { value: number }) => ({ doubled: task.value * 2, pid: process.pid }));
