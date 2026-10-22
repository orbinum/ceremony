/** Throws what the task describes: a message, and a `code` when given. */
import { serveOnce } from "../../../src/isolate";

serveOnce(async (task: { message: string; code?: unknown }) => {
  throw Object.assign(new Error(task.message), task.code === undefined ? {} : { code: task.code });
});
