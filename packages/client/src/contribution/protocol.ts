/** The messages between the page and the contribution worker: one request, one reply. */

export interface WorkerRequest {
  /** The head to extend. A copy: the page keeps its own for the checks. */
  input: Uint8Array;
  /** The name snarkjs writes into the new MPC entry (printable ASCII, SPEC §2.5). */
  name: string;
  /** The contributor's own text, mixed into the worker's randomness. */
  text: string;
}

export type WorkerReply =
  | { ok: true; output: Uint8Array; contributionHash: string }
  | { ok: false; message: string };
