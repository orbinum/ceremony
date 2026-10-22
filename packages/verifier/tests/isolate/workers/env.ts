/** Answers with the names of the variables it inherited. */
import { serveOnce } from "../../../src/isolate";

serveOnce(async () => Object.keys(process.env).toSorted());
