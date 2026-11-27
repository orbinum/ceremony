/**
 * The published inputs, fetched from the coordinator's public artifacts into `ceremonyDir` before
 * startup: for a host that starts with an empty disk (the Cloudflare Container). Trust comes from
 * `initSha256`, which the coordinator hands over from its frozen setup: init.json must hash to it,
 * and `loadInputs` then pins every genesis and the ptau against init.json as on any host. Each
 * file is a `GET <origin>/artifacts/<key>` with no redirect, bounded by 5 minutes (the ptau, the
 * largest, is ~75 MB) and by its size, and created exclusively: the directory starts empty.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CEREMONY_LAYOUT,
  fromUtf8,
  MAX_DOCUMENT_BYTES,
  MAX_FILE_BYTES,
  parseInit,
  sha256Hex,
} from "@orbinum-ceremony/core";
import { cappedToFile, readBytes } from "../../files";

const TIMEOUT_MS = 5 * 60_000;

async function get(origin: string, key: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(new URL(`/artifacts/${key}`, origin), {
    headers: { "accept-encoding": "identity" },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`${key}: the coordinator answered ${response.status}`);
  }
  return response.body;
}

async function toFile(origin: string, key: string, dest: string, maxBytes: number): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await cappedToFile(await get(origin, key), dest, maxBytes);
}

export async function mirrorInputs(
  origin: string,
  initSha256: string,
  ceremonyDir: string,
  ptau: string,
): Promise<void> {
  const initPath = join(ceremonyDir, CEREMONY_LAYOUT.init);
  await toFile(origin, CEREMONY_LAYOUT.init, initPath, MAX_DOCUMENT_BYTES);
  const bytes = await readBytes(initPath, MAX_DOCUMENT_BYTES);
  if (sha256Hex(bytes) !== initSha256) {
    throw new Error("init.json: the published file is not the one the coordinator's setup pins");
  }
  const init = parseInit(fromUtf8(bytes));
  for (const c of init.circuits) {
    const key = CEREMONY_LAYOUT.zkey(c.name, 0);
    // oxlint-disable-next-line no-await-in-loop
    await toFile(origin, key, join(ceremonyDir, key), MAX_FILE_BYTES);
  }
  await toFile(origin, CEREMONY_LAYOUT.ptau, ptau, init.ptau.size);
}
