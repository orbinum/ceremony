/**
 * The zkey verify pass rule: true from snarkjs and "ZKey Ok!" logged, both, with snarkjs replaced
 * so each verify returns what the test sets after logging its lines.
 */
import { describe, expect, it, vi } from "vitest";
import { verifyFromInit, verifyFromR1cs } from "../../../../src/snarkjs/in-process/verify";

type Logger = { info(msg: string): void };

const fake = vi.hoisted(() => {
  const state = { returned: true, lines: [] as string[] };
  const verify = async (_a: string, _b: string, _c: string, logger: Logger) => {
    for (const line of state.lines) logger.info(line);
    return state.returned;
  };
  return Object.assign(state, { verify });
});
vi.mock("snarkjs", () => ({ zKey: { verifyFromInit: fake.verify, verifyFromR1cs: fake.verify } }));

describe("the zkey verify pass rule", () => {
  it.each([
    ["true and 'ZKey Ok!'", true, ["checking", "ZKey Ok!"], true],
    ["true without 'ZKey Ok!'", true, ["checking"], false],
    ["'ZKey Ok!' but false", false, ["ZKey Ok!"], false],
    ["false and nothing logged", false, [], false],
  ])("%s → ok %s", async (_, returned, lines, ok) => {
    fake.returned = returned;
    fake.lines = lines;
    for (const verify of [verifyFromInit, verifyFromR1cs]) {
      const outcome = await verify("a", "b", "c");
      expect(outcome.ok).toBe(ok);
      expect(outcome.log).toBe(lines.map((l) => `[info] ${l}`).join("\n"));
    }
  });
});
