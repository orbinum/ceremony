/**
 * `n` distinct free local TCP ports: every listener is open at once before any is closed, so two
 * calls in one run never return the same port.
 */
import { createServer, type Server } from "node:net";

export async function freePorts(n: number): Promise<number[]> {
  const servers: Server[] = [];
  const ports: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = createServer();
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    servers.push(s);
    ports.push((s.address() as { port: number }).port);
  }
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  return ports;
}
