import { describe, expect, it } from "vitest";
import { signInOutcomeOf } from "../../src/api";

describe("signInOutcomeOf", () => {
  it("reads each outcome the callback writes", () => {
    expect(signInOutcomeOf("?auth=ok")).toEqual({ auth: "ok" });
    expect(signInOutcomeOf("?auth=cancelled")).toEqual({ auth: "cancelled" });
    expect(signInOutcomeOf("?auth=ineligible&reasons=account-too-new,no-public-repos")).toEqual({
      auth: "ineligible",
      reasons: ["account-too-new", "no-public-repos"],
    });
    expect(signInOutcomeOf("?auth=error&reason=state")).toEqual({ auth: "error", reason: "state" });
  });

  it("reads nothing from a page that was not the callback's", () => {
    expect(signInOutcomeOf("")).toBeNull();
    expect(signInOutcomeOf("?other=1")).toBeNull();
  });

  it("does not echo an unknown error reason", () => {
    expect(signInOutcomeOf("?auth=error&reason=<script>")).toEqual({
      auth: "error",
      reason: "github",
    });
  });
});
