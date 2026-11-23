/** Runs one contribution in a fresh worker (`worker.ts`) and ends that worker whatever happens. */
import type { WorkerReply, WorkerRequest } from "./protocol";

/** A contribution's output and its h_k, as snarkjs reports it (hex). */
export interface Computed {
  output: Uint8Array;
  contributionHash: string;
}

/** What computes a contribution: the worker in the browser, a fake in the tests. */
export type Compute = (input: Uint8Array, name: string, text: string) => Promise<Computed>;

/** One worker per contribution: nothing of one circuit's run survives into the next. */
export const computeInWorker: Compute = (input, name, text) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const end = () => worker.terminate();
    worker.addEventListener(
      "message",
      ({ data }: MessageEvent<WorkerReply>) => {
        end();
        if (data.ok) resolve({ output: data.output, contributionHash: data.contributionHash });
        else reject(new Error(`the contribution failed: ${data.message}`));
      },
      { once: true },
    );
    worker.addEventListener(
      "error",
      (event) => {
        end();
        reject(new Error(`the contribution worker failed: ${event.message || "unknown error"}`));
      },
      { once: true },
    );
    const request: WorkerRequest = { input: input.slice(), name, text };
    worker.postMessage(request, [request.input.buffer]);
  });
