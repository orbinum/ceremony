/**
 * The contribution itself, alone in a module worker: snarkjs 0.7.6's `zkey contribute` on bytes in
 * memory. The entropy is drawn here, 32 bytes of `crypto.getRandomValues` with the contributor's
 * text, and snarkjs adds 64 bytes of its own from the same source, so the page never holds it. It
 * is never empty: snarkjs would prompt for it, and a worker has no window to prompt from. The
 * worker answers one request and closes, and the page terminates it, so its memory, the toxic
 * waste with it, is released as far as JS can promise. `self` is typed here as the dedicated
 * worker scope this file uses, since the DOM lib types it as a window.
 */
import { toHex } from "@orbinum-ceremony/core";
import { zKey } from "snarkjs";
import type { WorkerReply, WorkerRequest } from "../types";

interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerRequest>) => void,
    options: { once: true },
  ): void;
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
  close(): void;
}

const scope = self as unknown as WorkerScope;

async function contribute({ data }: MessageEvent<WorkerRequest>) {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  try {
    const entropy = `${toHex(seed)}${data.text}`;
    const next: { type: "mem"; data?: Uint8Array } = { type: "mem" };
    const hash = await zKey.contribute(data.input, next, data.name, entropy);
    if (!next.data) throw new Error("snarkjs wrote no key");
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    scope.postMessage({ ok: true, output: next.data, contributionHash: toHex(hash) }, [
      next.data.buffer,
    ]);
  } catch (error) {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    scope.postMessage({ ok: false, message: error instanceof Error ? error.message : "failed" });
  } finally {
    seed.fill(0);
    data.input.fill(0);
    scope.close();
  }
}

scope.addEventListener("message", (event) => void contribute(event), { once: true });
