/** Exits cleanly without ever answering. */
import { serveOnce } from "../../../src/isolate";

serveOnce(async () => process.exit(0));
