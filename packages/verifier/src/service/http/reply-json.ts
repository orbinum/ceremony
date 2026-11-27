/** Answers JSON; anything but a 202 closes the connection, so non-dispatches cannot hold a slot. */
import type { ServerResponse } from "node:http";

export const replyJson = (res: ServerResponse, status: number, body: unknown) => {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, {
    "content-type": "application/json",
    ...(status === 202 ? {} : { connection: "close" }),
  });
  res.end(JSON.stringify(body));
};
