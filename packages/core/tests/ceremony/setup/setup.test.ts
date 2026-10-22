/**
 * The frozen setup: canonical pinned texts, consistent with each other and the config. SPEC
 * §6.1–6.2.
 */
import { describe, expect, it } from "vitest";
import { genesisOf, parseSetup, sameSetup, scheduleOf } from "../../../src/ceremony/setup";
import { chainGenesis } from "../../../src/ceremony/transcript";
import { sha256Hex } from "../../../src/primitives/hashing";
import { utf8 } from "../../../src/primitives/encoding";
import { serializeJson } from "../../../src/primitives/encoding";
import { ANNOUNCEMENT, FULL_INIT, ID, INIT_TEXT, SETUP_INPUT } from "../../support";

const input = SETUP_INPUT;

describe("parseSetup (SPEC §6.1–6.2)", () => {
  it("accepts the published pair and roots the chain in it", () => {
    const s = parseSetup(input, ID);
    expect(s.init).toEqual(FULL_INIT);
    expect(s.chainGenesis).toBe(chainGenesis(ID, JSON.parse(input.announcement)));
    expect(s.announcementSha256).toBe(sha256Hex(utf8(input.announcement)));
  });

  it.each([
    ["another ceremony", input, "other-1", /not ceremony other-1/],
    [
      "init bytes the announcement did not pin",
      { ...input, init: input.init.replace('"--O1"', '"--O2"') },
      ID,
      /not the one ceremony\.json announced/,
    ],
    [
      "a missing genesis size",
      { ...input, genesisSizes: { unshield: 1000, transfer: 1000 } },
      ID,
      /no genesis size for shield/,
    ],
    [
      "a negative genesis size",
      { ...input, genesisSizes: { ...input.genesisSizes, shield: -1 } },
      ID,
      /no genesis size for shield/,
    ],
    [
      "a genesis size of 0",
      { ...input, genesisSizes: { ...input.genesisSizes, shield: 0 } },
      ID,
      /no genesis size for shield/,
    ],
    ["text that is not JSON", { ...input, init: "{" }, ID, /init\.json: not valid JSON/],
    [
      "a document instead of its text",
      { ...input, init: FULL_INIT as unknown as string },
      ID,
      /must be the published texts/,
    ],
  ])("refuses %s", (_, value, id, message) => {
    expect(() => parseSetup(value, id)).toThrow(message);
  });
});

/** The support ceremony (shield only) announced on `network`. */
const partial = (network: "local" | "testnet") => ({
  announcement: serializeJson({ ...ANNOUNCEMENT, network }),
  init: INIT_TEXT,
  genesisSizes: { shield: 1000 },
});

describe("parseSetup coverage and canonical texts", () => {
  it("requires every pinned circuit outside a local ceremony", () => {
    expect(() => parseSetup(partial("testnet"), ID)).toThrow(
      "setup: unshield missing; transfer missing",
    );
    expect(parseSetup(partial("local"), ID).init.circuits.map((c) => c.name)).toEqual(["shield"]);
  });

  it("refuses pinned texts that are not canonical", () => {
    const spaced = { ...input, announcement: `${input.announcement}\n` };
    expect(() => parseSetup(spaced, ID)).toThrow(/ceremony\.json: not in canonical form/);
    const minified = { ...input, init: `${JSON.stringify(JSON.parse(input.init))}\n` };
    expect(() => parseSetup(minified, ID)).toThrow(/init\.json: not in canonical form/);
  });
});

describe("setup helpers", () => {
  it("finds a circuit's genesis, compares setups and reads the schedule", () => {
    const s = parseSetup(input, ID);
    expect(genesisOf(s, "shield")?.genesis_sha256).toBe(FULL_INIT.circuits[0]?.genesis_sha256);
    expect(sameSetup(s, parseSetup(input, ID))).toBe(true);
    const bigger = { ...input, genesisSizes: { ...input.genesisSizes, shield: 1001 } };
    expect(sameSetup(s, parseSetup(bigger, ID))).toBe(false);
    expect(scheduleOf(s)).toEqual({
      openAt: Date.parse(s.announcement.schedule.open),
      closeAt: Date.parse(s.announcement.schedule.close),
    });
  });
});
