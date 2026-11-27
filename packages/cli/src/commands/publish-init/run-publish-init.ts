/**
 * Publishes the frozen setup before contributions open, holding the directory's lock, and has the
 * coordinator configure it (which it validates again); returns the announcement's SHA-256, the
 * value to pin officially. Each file is read once and checked against its pin, and those same
 * bytes are uploaded, in core's order: `ceremony.json` last, so a run that fails midway never
 * leaves the (immutable) announcement published without the files it pins. The announcement and
 * init texts the coordinator will hash are exactly the bytes uploaded, and the setup is parsed here
 * first, so nothing is uploaded if the coordinator would refuse it.
 */
import { join } from "node:path";
import {
  ADMIN_PATHS,
  CEREMONY_LAYOUT,
  type CircuitName,
  circuitsOf,
  fromUtf8,
  parseSetup,
  type SetupInput,
  setupFiles,
  sha256Hex,
  sha256Utf8,
} from "@orbinum-ceremony/core";
import { layout, loadCeremony } from "../../artifacts";
import { assertPinnedBytes, assertPtauBytes, postJson, publishArtifact, readBytes } from "../../io";
import { withLock } from "../../store";
import type { PublishInitOptions } from "./types";

async function readPinnedSetup(options: PublishInitOptions) {
  const { announcement, init } = await loadCeremony(options.dir);
  const files = new Map<string, Uint8Array>();
  for (const key of setupFiles(init.value)) {
    const path = key === CEREMONY_LAYOUT.ptau ? options.ptau : join(options.dir, key);
    files.set(key, await readBytes(path));
  }
  const bytes = (key: string) => files.get(key) as Uint8Array;
  assertPtauBytes(bytes(CEREMONY_LAYOUT.ptau));
  for (const c of circuitsOf(init.value)) {
    assertPinnedBytes(init.value, c, "genesis", bytes(CEREMONY_LAYOUT.zkey(c, 0)));
    assertPinnedBytes(init.value, c, "r1cs", bytes(CEREMONY_LAYOUT.r1cs(c)));
  }
  const text = (key: string) => {
    try {
      return fromUtf8(bytes(key));
    } catch {
      throw new Error(`${key}: not valid UTF-8`);
    }
  };
  const genesisSizes: Partial<Record<CircuitName, number>> = {};
  for (const c of circuitsOf(init.value)) {
    genesisSizes[c] = bytes(CEREMONY_LAYOUT.zkey(c, 0)).length;
  }
  const setup: SetupInput = {
    announcement: text(CEREMONY_LAYOUT.announcement),
    init: text(CEREMONY_LAYOUT.init),
    genesisSizes,
  };
  const pinned = announcement.sha256;
  if (sha256Hex(bytes(CEREMONY_LAYOUT.announcement)) !== pinned) {
    throw new Error("ceremony.json changed while it was being read");
  }
  if (sha256Utf8(setup.announcement) !== pinned) {
    throw new Error("ceremony.json does not round-trip as UTF-8 text (a byte-order mark?)");
  }
  parseSetup(setup, announcement.value.ceremony_id);
  return { announcement, files, setup };
}

export async function runPublishInit(options: PublishInitOptions): Promise<string> {
  return withLock(layout(options.dir).lock, async () => {
    const { announcement, files, setup } = await readPinnedSetup(options);
    for (const [key, bytes] of files) {
      await publishArtifact(options.coordinator, key, bytes);
      console.log(`published ${key}`);
    }
    await postJson(options.coordinator, ADMIN_PATHS.configure, setup);
    console.log(
      `configured ${announcement.value.ceremony_id}; ceremony.json SHA-256 ${announcement.sha256}`,
    );
    return announcement.sha256;
  });
}
