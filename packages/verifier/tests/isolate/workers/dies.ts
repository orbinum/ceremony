/** Prints a stack-like line naming a private path, then dies without answering. */
import { homedir } from "node:os";
import { serveOnce } from "../../../src/isolate";

serveOnce(async () => {
  process.stderr.write(`fatal \u001b[31mboom\u001b[0m at ${homedir()}/install/node_modules/x.js\n`);
  process.exit(3);
});
