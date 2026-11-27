/**
 * The ceremony setups the tests configure: the rehearsal's hashes, or small published genesis
 * files; both texts in the canonical form core requires.
 */
import { env } from "cloudflare:workers";
import { PUBLIC } from "./buckets";
import {
  type Admission,
  buildAnnouncement,
  CEREMONY_LAYOUT,
  type CircuitName,
  INIT_SCHEMA,
  type InitRecord,
  serializeJson,
  type SetupInput,
  sha256Hex,
  validateInit,
} from "@orbinum-ceremony/core";

type Fixture<T> = Record<string, T> & Record<"shield" | "unshield" | "transfer", T>;

export const GENESIS_SHA256: Fixture<string> = {
  shield: "447849ca88ead88908b575203aab4d150d48b8f5a2f9a0f12ae705727d59fbaa",
  unshield: "3e2d8cfa8a4a7d9e080e4f7c86d738768bf78edc8ec0d7d99f9b027f7fb326aa",
  transfer: "c98105995444d2f00b4829427bc4f19000af7091641d0a5702430d0e4b0a14ca",
};

export const GENESIS_SIZES: Fixture<number> = {
  shield: 2 ** 20,
  unshield: 30 * 2 ** 20,
  transfer: 60 * 2 ** 20,
};

export const INIT: InitRecord = validateInit({
  schema: INIT_SCHEMA,
  ceremony_id: env.CEREMONY_ID,
  created_at: "2026-01-01T00:00:00.000Z",
  ptau: {
    file: "powersOfTau28_hez_final_16.ptau",
    blake2b512:
      "6a6277a2f74e1073601b4f9fed6e1e55226917efb0f0db8a07d98ab01df1ccf43eb0e8c3159432acd4960e2f29fe84a4198501fa54c8dad9e43297453efec125",
    size: 75580568,
  },
  tooling: {
    snarkjs: "0.7.6",
    circom: "2.2.3",
    circomlib: "2.0.5",
    circom_flags: ["--r1cs", "--O1"],
  },
  source: { ref: "v0.16.0", commit: "efe10bf3ef1d928c9c209fee4077750334410cfe" },
  circuits: (["shield", "unshield", "transfer"] as const).map((name, i) => ({
    name,
    circuit_id: 3 - i,
    ceremony_version: name === "shield" ? 2 : 4,
    r1cs_sha256: "00".repeat(32),
    constraints: 1000 * (i + 1),
    public_signals: 3,
    wires: 1000 * (i + 1),
    domain_power: 10 + i,
    genesis_sha256: GENESIS_SHA256[name],
    cs_hash: `${i + 1}`.repeat(128),
  })),
});

interface SetupOptions {
  init?: InitRecord;
  admission?: Admission;
  beaconDelaySeconds?: number;
  minContributions?: number;
}

export function setupInput(openAt: number, closeAt: number, o: SetupOptions = {}): SetupInput {
  const ceremonyId = env.CEREMONY_ID;
  const record = o.init ?? INIT;
  const init = serializeJson(record);
  const announcement = buildAnnouncement({
    ceremonyId,
    network: "local",
    initSha256: sha256Hex(new TextEncoder().encode(init)),
    circuitsSource: {
      repo: "https://github.com/orbinum/circuits",
      tag: "v0.16.0",
      commit: record.source.commit,
    },
    minContributions: o.minContributions ?? 1,
    ...(o.admission ? { admission: o.admission } : {}),
    open: new Date(openAt),
    close: new Date(closeAt),
    beaconDelaySeconds: o.beaconDelaySeconds ?? 86_400,
  });
  const sizes = Object.fromEntries(record.circuits.map((c) => [c.name, GENESIS_SIZES[c.name]]));
  return { announcement: serializeJson(announcement), init, genesisSizes: sizes };
}

const genesisBytes = (c: CircuitName) => new TextEncoder().encode(`genesis of ${c}`);
const r1csBytes = (c: CircuitName) => new TextEncoder().encode(`r1cs of ${c}`);

export async function publishedSetup(openAt: number, closeAt: number): Promise<SetupInput> {
  const init = structuredClone(INIT);
  for (const c of init.circuits) {
    c.genesis_sha256 = sha256Hex(genesisBytes(c.name));
    c.r1cs_sha256 = sha256Hex(r1csBytes(c.name));
  }
  for (const c of init.circuits) {
    await PUBLIC.put(CEREMONY_LAYOUT.zkey(c.name, 0), genesisBytes(c.name), {
      sha256: c.genesis_sha256,
    });
    await PUBLIC.put(CEREMONY_LAYOUT.r1cs(c.name), r1csBytes(c.name), {
      sha256: c.r1cs_sha256,
    });
  }
  const input = setupInput(openAt, closeAt, { init });
  for (const [key, text] of [
    [CEREMONY_LAYOUT.announcement, input.announcement],
    [CEREMONY_LAYOUT.init, input.init],
  ] as const) {
    await PUBLIC.put(key, text, { sha256: sha256Hex(new TextEncoder().encode(text)) });
  }
  return {
    ...input,
    genesisSizes: Object.fromEntries(
      init.circuits.map((c) => [c.name, genesisBytes(c.name).length]),
    ),
  };
}
