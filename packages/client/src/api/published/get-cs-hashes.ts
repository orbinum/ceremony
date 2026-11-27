/** Each circuit's csHash, from the published `init.json`: a head must be that circuit's. */
import { CEREMONY_LAYOUT, type CircuitName, fromUtf8, parseInit } from "@orbinum-ceremony/core";
import { getBytes } from "../http";

export async function getCsHashes(): Promise<Map<CircuitName, string>> {
  const init = parseInit(fromUtf8(await getBytes(`/artifacts/${CEREMONY_LAYOUT.init}`)));
  return new Map(init.circuits.map((c) => [c.name, c.cs_hash]));
}
