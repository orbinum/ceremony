/** A session cookie's claims are read back strictly. SPEC §3.2. */
import { describe, expect, it } from "vitest";
import { validateSessionClaims } from "../../../src/coordination/admission";
import { FormatError } from "../../../src/primitives/errors";

describe("session claims", () => {
  it("reads a GitHub identity back, and nothing else", () => {
    expect(validateSessionClaims({ gid: 5, login: "octo-cat", exp: 1 })).toEqual({
      gid: 5,
      login: "octo-cat",
    });
    for (const bad of [
      null,
      [],
      { gid: 0, login: "a" },
      { gid: "5", login: "a" },
      { gid: 5 },
      { gid: 5, login: "-x-" },
    ]) {
      expect(() => validateSessionClaims(bad)).toThrow(FormatError);
    }
  });
});
