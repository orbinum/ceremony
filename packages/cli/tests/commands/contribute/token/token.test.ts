/** The CLI token's lifetime, read from its own payload: a session must not outlive it. */
import { describe, expect, it } from "vitest";
import { TokenRefused } from "../../../../src/commands/contribute/retry";
import { assertTokenLife, tokenLifeMs } from "../../../../src/commands/contribute/token";

const token = (payload: unknown) =>
  `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

describe("the CLI token's lifetime", () => {
  it("is read from its payload, and is 0 for one without a readable expiry", () => {
    expect(tokenLifeMs(token({ exp: 5_000 }), 1_000)).toBe(4_000);
    for (const t of [token({}), token({ exp: "soon" }), "not-a-token", ""]) {
      expect(tokenLifeMs(t, 1_000)).toBe(0);
    }
  });

  it("stops a run whose token would expire mid-session, saying the place in line is kept", () => {
    const short = token({ exp: Date.now() + 60_000 });
    expect(() => assertTokenLife(short, false)).toThrow(TokenRefused);
    expect(() => assertTokenLife(short, true)).toThrow(/your place in line is kept/);
    expect(() => assertTokenLife(token({ exp: Date.now() + 24 * 3_600_000 }), false)).not.toThrow();
  });
});
