/**
 * A public file's bytes (`/artifacts/…`), or an `ApiError` if it is not there. Always revalidated:
 * a stale copy (a leftover the coordinator replaced) would fail its hash check and end the turn.
 */
import { answerOf } from "./answer-of";

export async function getBytes(path: string): Promise<Uint8Array> {
  const r = await fetch(path, { credentials: "same-origin", cache: "no-cache" });
  if (!r.ok) await answerOf(r);
  return new Uint8Array(await r.arrayBuffer());
}
