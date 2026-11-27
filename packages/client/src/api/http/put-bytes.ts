/** A `PUT` of raw bytes to the coordinator; resolves with the JSON answer. */
import { answerOf } from "./answer-of";

export async function putBytes<T>(
  path: string,
  bytes: Uint8Array,
  headers: Record<string, string>,
): Promise<T> {
  return answerOf<T>(
    await fetch(path, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/octet-stream", ...headers },
      body: bytes as Uint8Array<ArrayBuffer>,
    }),
  );
}
