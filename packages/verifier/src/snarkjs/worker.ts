/** Child entry: runs one snarkjs operation in-process (see `isolated.ts`). */
import { serveOnce } from "../isolate";
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
