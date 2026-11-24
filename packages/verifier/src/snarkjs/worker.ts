/** Child entry: runs one snarkjs operation in-process (see `isolated.ts`). */
// Not the isolate barrel: it would load the parent side, and core's wallet libraries with it.
import { serveOnce } from "../isolate/child";
import * as inProcess from "./snarkjs";
import type { SnarkjsTask } from "./isolated";

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
