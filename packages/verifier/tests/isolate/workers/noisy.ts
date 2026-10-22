/** Floods stderr, then dies without answering. */
import { serveOnce } from "../../../src/isolate";

serveOnce(
  () =>
    new Promise(() => {
      process.stderr.write("x".repeat(1024 * 1024), () => process.exit(2));
    }),
);
