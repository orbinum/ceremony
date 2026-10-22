/**
 * Allocates outside the JS heap (as snarkjs does with WASM and buffers) until stopped; past 4 GiB
 * it answers instead, so a watchdog that never fires fails the test rather than the host.
 */
import { serveOnce } from "../../../src/isolate";

const kept: Buffer[] = [];
serveOnce(async () => {
  while (kept.length * 16 < 4096) {
    kept.push(Buffer.alloc(16 * 1024 ** 2, 1));
    // oxlint-disable-next-line no-await-in-loop -- yields so the watchdog can run
    await new Promise((r) => setTimeout(r, 5));
  }
  return "grew to 4 GiB without being stopped";
});
