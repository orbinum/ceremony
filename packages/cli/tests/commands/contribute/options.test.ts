/** `contribute` options: the token only from the environment, never echoed; https only. */
import { describe, expect, it } from "vitest";
import { parseContributeOptions, TOKEN_ENV, UsageError } from "../../../src/api";

const TOKEN = `${"a".repeat(40)}.${"0".repeat(64)}`;
const SHA = "ab".repeat(32);
const C = (url: string) => ["--coordinator", url, "--announcement-sha256", SHA];

describe("contribute options", () => {
  it("reads the token from the environment and the coordinator as an origin", () => {
    const o = parseContributeOptions(C("https://ceremony.example/x/"), {
      [TOKEN_ENV]: ` ${TOKEN}\n`,
    });
    expect(o).toMatchObject({
      coordinator: "https://ceremony.example",
      announcementSha256: SHA,
      token: TOKEN,
    });
    expect(o.work).toBeUndefined();
  });

  it("refuses a missing or malformed token without showing it", () => {
    for (const value of [
      undefined,
      "",
      "secret-not-a-token",
      `${TOKEN}.x`,
      `${TOKEN.slice(0, -1)}G`,
    ]) {
      let error: unknown;
      try {
        parseContributeOptions(C("https://c.example"), { [TOKEN_ENV]: value });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(UsageError);
      expect(String((error as Error).message)).not.toContain(value || "\u0000");
    }
  });

  it("refuses the token as an argument, plaintext http and credentials in the URL", () => {
    const env = { [TOKEN_ENV]: TOKEN };
    for (const argv of [
      [...C("https://c.example"), "--token", TOKEN],
      C("http://c.example"),
      C("https://user:pass@c.example"),
      ["--coordinator", "https://c.example"],
      ["--coordinator", "https://c.example", "--announcement-sha256", "xyz"],
      [],
    ]) {
      expect(() => parseContributeOptions(argv, env)).toThrow(UsageError);
    }
    expect(parseContributeOptions(C("http://127.0.0.1:8787"), env).coordinator).toBe(
      "http://127.0.0.1:8787",
    );
  });
});

describe("a token pasted on the command line", () => {
  it("is never echoed in the usage error", () => {
    for (const argv of [[TOKEN], [`--token=${TOKEN}`], [...C("https://c.example"), TOKEN]]) {
      let message = "";
      try {
        parseContributeOptions(argv, { [TOKEN_ENV]: TOKEN });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).not.toBe("");
      expect(message).not.toContain(TOKEN);
    }
  });
});
