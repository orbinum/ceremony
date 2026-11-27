/** The head a contributor downloads before extending a circuit. */
import type { CircuitName } from "../../config";
import { CEREMONY_LAYOUT } from "../../ceremony";

export const headView = (head: { index: number; outputSha256: string }, circuit: CircuitName) => ({
  index: head.index,
  output_sha256: head.outputSha256,
  url: `/artifacts/${CEREMONY_LAYOUT.zkey(circuit, head.index)}`,
});
