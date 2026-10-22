/** Local HTTP servers standing in for a mirror or a coordinator. */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** A local HTTP server for one test: routes by path, records every request it received. */
export async function localServer(
  routes: Record<string, (req: IncomingMessage, res: ServerResponse, body: Buffer) => void>,
) {
  const requests: {
    method: string;
    path: string;
    headers: IncomingMessage["headers"];
    body: Buffer;
  }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      const body = Buffer.concat(chunks);
      requests.push({ method: req.method ?? "", path, headers: req.headers, body });
      const route = routes[path] ?? routes["*"];
      if (route) route(req, res, body);
      else res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** A JSON answer. */
export const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

/** Serves `dir` read-only, as the public bucket would. */
export const serveDir = (dir: string) =>
  localServer({
    "*": (req, res) => {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      void import("node:fs/promises")
        .then((fs) => fs.readFile(`${dir}${decodeURIComponent(path)}`))
        .then(
          (body) => res.writeHead(200).end(body),
          () => res.writeHead(404).end(),
        );
    },
  });
