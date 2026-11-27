/** Whether an upload may be stored and verified now. */
import { describe, expect, it } from "vitest";
import { scheduleOf, parseSetup } from "../../../src/ceremony/setup";
import { initialQueue, type QueueState, step } from "../../../src/coordination/queue";
import { checkUpload } from "../../../src/coordination/upload";
import { BYTES_PER_CONTRIBUTION } from "../../../src/config";
import {
  chain as chainFrom,
  contribution,
  h,
  ID,
  OPEN,
  SETUP_INPUT,
  CIRCUIT_NAMES,
} from "../../support";

const SETUP = parseSetup(SETUP_INPUT, ID);
const chain = (records: Parameters<typeof chainFrom>[0]) => chainFrom(records, SETUP.chainGenesis);
const ALICE = 101;
const claim = (inputSha256: string) => ({
  inputSha256,
  outputSha256: h(500),
  contributionHash: h(9, 64),
  method: "browser" as const,
  client: { name: "c", version: "1", commit: "abc1234" },
});

const CLOSE = scheduleOf(SETUP).closeAt;

function claimedAt(t: number): QueueState {
  let s = step(initialQueue(scheduleOf(SETUP), CIRCUIT_NAMES), { type: "tick" }, t).state;
  for (const e of [
    { type: "join", githubId: ALICE },
    { type: "claim", githubId: ALICE },
  ] as const) {
    const r = step(s, e, t);
    if (!r.ok) throw new Error(r.refusal);
    s = r.state;
  }
  return s;
}

const claimed = () => claimedAt(OPEN);

describe("checkUpload", () => {
  it("accepts the next circuit extending the head, and names its job", () => {
    const records = chain([contribution(1)]);
    const r = checkUpload(
      SETUP,
      claimed(),
      records,
      { githubId: ALICE, circuit: "shield", claim: claim(h(101)), size: 1000 },
      OPEN,
    );
    expect(r).toMatchObject({
      ok: true,
      job: { seq: 1, circuit: "shield", attempt: 1, index: 2 },
      genesisSha256: h(100),
      head: { index: 1, outputSha256: h(101) },
    });
  });

  it("refuses a stale head, a size over the bound, another caller and a circuit out of order", () => {
    const s = claimed();
    const up = (patch: object) =>
      checkUpload(
        SETUP,
        s,
        [],
        { githubId: ALICE, circuit: "shield", claim: claim(h(100)), size: 1000, ...patch },
        OPEN,
      );
    expect(up({ claim: claim(h(999)) })).toEqual({ ok: false, refusal: "stale-head" });
    expect(up({ size: 1000 + BYTES_PER_CONTRIBUTION + 1 })).toEqual({
      ok: false,
      refusal: "too-large",
    });
    expect(up({ size: 1000 + BYTES_PER_CONTRIBUTION })).toMatchObject({ ok: true });
    expect(up({ githubId: 999 })).toEqual({ ok: false, refusal: "not-your-slot" });
    expect(up({ circuit: "transfer" })).toEqual({ ok: false, refusal: "out-of-order" });
  });

  it("refuses an upload after the close though the alarm has not closed the queue yet", () => {
    const s = claimedAt(CLOSE - 10_000);
    const upload = {
      githubId: ALICE,
      circuit: "shield" as const,
      claim: claim(h(100)),
      size: 1000,
    };
    expect(s.phase).toBe("OPEN");
    expect(checkUpload(SETUP, s, [], upload, CLOSE - 1)).toMatchObject({ ok: true });
    expect(checkUpload(SETUP, s, [], upload, CLOSE + 60_000)).toEqual({
      ok: false,
      refusal: "not-open",
    });
  });

  it("never mutates the state it checks", () => {
    const s = claimed();
    const before = structuredClone(s);
    checkUpload(
      SETUP,
      s,
      [],
      { githubId: ALICE, circuit: "shield", claim: claim(h(100)), size: 1 },
      OPEN,
    );
    expect(s).toEqual(before);
  });
});
