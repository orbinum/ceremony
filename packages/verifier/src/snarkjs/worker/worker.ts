/**
 * Child entry of an isolated snarkjs operation: runs one in-process operation and exits. It imports
 * `serveOnce` by file, not through the isolate barrel, which would load the parent side and core's
 * wallet libraries with it.
 */
import { serveOnce } from "../../isolate/serve-once";
import * as inProcess from "../in-process";
import type { SnarkjsTask } from "../types";

serveOnce<SnarkjsTask, unknown>(async ({ op, args }) => {
  switch (op) {
    case "newGenesisZkey":
      return inProcess.newGenesisZkey(...args);
    case "contribute":
      return inProcess.contribute(...args);
    case "applyBeacon":
      return inProcess.applyBeacon(...args);
    case "exportVerificationKey":
      return inProcess.exportVerificationKey(...args);
    case "verifyFromR1cs":
      return inProcess.verifyFromR1cs(...args);
    case "verifyFromInit":
      return inProcess.verifyFromInit(...args);
  }
});
