/** The zkey verify pass rule (SPEC §2.5, A7): true from snarkjs and "ZKey Ok!" logged, both. */
import { describe, expect, it, vi } from "vitest";
import { verifyFromInit, verifyFromR1cs } from "../../src/snarkjs/snarkjs";

type Logger = { info(msg: string): void };

/** snarkjs replaced: each verify returns `returned` after logging `lines`. */
const fake = vi.hoisted(() => {
  const state = { returned: true, lines: [] as string[] };
  const verify = async (_a: string, _b: string, _c: string, logger: Logger) => {
    for (const line of state.lines) logger.info(line);
    return state.returned;
  };
  return Object.assign(state, { verify });
});
vi.mock("snarkjs", () => ({ zKey: { verifyFromInit: fake.verify, verifyFromR1cs: fake.verify } }));

describe("the zkey verify pass rule (SPEC §2.5, A7)", () => {
  it.each([
    ["true and 'ZKey Ok!'", true, ["checking", "ZKey Ok!"], true],
    ["true without 'ZKey Ok!'", true, ["checking"], false],
    ["'ZKey Ok!' but false", false, ["ZKey Ok!"], false],
    ["false and nothing logged", false, [], false],
  ])("%s → ok %s", async (_, returned, lines, ok) => {
    fake.returned = returned;
    fake.lines = lines;
    for (const verify of [verifyFromInit, verifyFromR1cs]) {
      // oxlint-disable-next-line no-await-in-loop -- one call at a time
      const outcome = await verify("a", "b", "c");
      expect(outcome.ok).toBe(ok);
      expect(outcome.log).toBe(lines.map((l) => `[info] ${l}`).join("\n"));
    }
  });
});
