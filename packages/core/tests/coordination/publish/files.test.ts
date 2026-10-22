/** What the coordinator publishes after each change. SPEC §6.1, KL-28, KL-31. */
import { describe, expect, it } from "vitest";
import { parseSetup, scheduleOf } from "../../../src/ceremony/setup";
import { publicFilesOf } from "../../../src/coordination/publish";
import { serializeJson } from "../../../src/primitives/encoding";
import { initialQueue } from "../../../src/coordination/queue";
import { chain as chainFrom, contribution, ID, OPEN, SETUP_INPUT } from "../../support";

const SETUP = parseSetup(SETUP_INPUT, ID);
const chain = (records: Parameters<typeof chainFrom>[0]) => chainFrom(records, SETUP.chainGenesis);
const STATE = initialQueue(scheduleOf(SETUP));

describe("public files (SPEC §6.1)", () => {
  it("publishes a consistent transcript and the status, versioned by content", () => {
    const records = chain([contribution(1)]);
    const [transcript, status] = publicFilesOf(SETUP, STATE, records, OPEN);
    expect(transcript?.key).toBe("transcript.json");
    expect(transcript?.body.ok && JSON.parse(transcript.body.text).records).toEqual(records);
    expect(transcript?.body.ok && transcript.body.text.endsWith("}\n")).toBe(true);
    expect(status?.key).toBe("status.json");
    // The version ignores the timestamp: the same state is not written twice.
    expect(publicFilesOf(SETUP, STATE, records, OPEN + 1)[1]?.version).toBe(status?.version);
    expect(
      publicFilesOf(SETUP, STATE, chain([contribution(1), contribution(2)]), OPEN)[1]?.version,
    ).not.toBe(status?.version);
  });

  it("withholds a transcript that fails its integrity checks, never the status", () => {
    const records = chain([contribution(1)]);
    const broken = [{ ...records[0], chain: "00".repeat(32) }] as typeof records;
    const [transcript, status] = publicFilesOf(SETUP, STATE, broken, OPEN);
    const body = transcript?.body;
    expect(body).toMatchObject({ ok: false });
    expect(body && !body.ok ? body.problems.join(" ") : "").toMatch(/broken at record/);
    expect(status?.body.ok).toBe(true);
  });

  it("publishes a sealed ceremony's finals with its transcript, as a new version", () => {
    const records = chain([contribution(1)]);
    const final = {
      circuit: "shield" as const,
      contributions: 1,
      final_zkey_sha256: "aa".repeat(32),
      vk_json_sha256: "bb".repeat(32),
      vk_hash: null,
      cs_hash: "cc".repeat(64),
      delta_neq_gamma: true as const,
      final_chain: records.at(-1)?.chain as string,
    };
    const [open] = publicFilesOf(SETUP, STATE, records, OPEN);
    const [sealed] = publicFilesOf(SETUP, STATE, records, OPEN, [final]);
    expect(sealed?.body.ok && JSON.parse(sealed.body.text).finals).toEqual([final]);
    expect(sealed?.version).not.toBe(open?.version);
  });

  it("serializes JSON the way every tool writes it", () => {
    expect(serializeJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
