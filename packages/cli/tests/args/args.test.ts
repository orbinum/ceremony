/** Command-line options: every bad option is a usage error that says what is wrong. */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  endpointOption,
  intOption,
  parseOptions,
  required,
  sha256Option,
  UsageError,
} from "../../src/args";

describe("command-line options", () => {
  it("turns parseArgs errors into usage errors", () => {
    expect(() => parseOptions(["--nope"], { dir: { type: "string" } })).toThrow(
      /Unknown option '--nope'/,
    );
    expect(() => parseOptions(["stray"], { dir: { type: "string" } })).toThrow(
      /Unexpected argument 'stray'/,
    );
    expect(parseOptions(["--dir", "x"], { dir: { type: "string" } })).toEqual({ dir: "x" });
  });

  it("names a missing option", () => {
    expect(() => required(undefined, "dir")).toThrow(new UsageError("missing --dir"));
    expect(() => required("", "dir")).toThrow(new UsageError("missing --dir"));
  });

  it("reads a SHA-256 in any case, and nothing else", () => {
    expect(sha256Option("AB".repeat(32), "x")).toBe("ab".repeat(32));
    for (const bad of ["ab", "zz".repeat(32), "ab".repeat(33), `0x${"ab".repeat(32)}`]) {
      expect(() => sha256Option(bad, "x")).toThrow(
        new UsageError("--x must be a SHA-256 (64 hex characters)"),
      );
    }
  });

  it("reads integers strictly, inside their bounds", () => {
    expect(intOption("3", "n", 1, 10)).toBe(3);
    for (const bad of ["0", "11", "1.5", "1e3", " 3", "-1", "0x10", ""]) {
      expect(() => intOption(bad, "n", 1, 10)).toThrow(/--n must be an integer from 1 to 10/);
    }
  });

  it("allows http only to this machine, and never credentials", () => {
    expect(endpointOption("https://pub.example.org/", "from")).toBe("https://pub.example.org");
    expect(endpointOption("https://pub.example.org/c/x/", "from")).toBe(
      "https://pub.example.org/c/x",
    );
    expect(endpointOption("http://127.0.0.1:8787", "from")).toBe("http://127.0.0.1:8787");
    expect(endpointOption("http://localhost:1/a", "from")).toBe("http://localhost:1/a");
    for (const bad of [
      "http://example.org",
      "http://127.0.0.2",
      "ftp://example.org",
      "file:///etc",
    ]) {
      expect(() => endpointOption(bad, "from")).toThrow(
        new UsageError("--from must be https (http only to localhost)"),
      );
    }
    expect(() => endpointOption("https://user:pw@example.org", "from")).toThrow(
      new UsageError("--from must not carry credentials"),
    );
    expect(() => endpointOption("not a url", "from")).toThrow(
      new UsageError("--from is not a URL"),
    );
  });
});

describe("every command's options", async () => {
  const cli = await import("../../src/api");
  const sha = "ab".repeat(32);

  it("parse a complete call", () => {
    expect(
      cli.parseDownloadOptions([
        "--from",
        "https://x.org/",
        "--dir",
        "d",
        "--announcement-sha256",
        sha,
      ]),
    ).toEqual({
      from: "https://x.org",
      dir: resolve("d"),
      announcementSha256: sha,
      withPtau: false,
      force: false,
    });
    expect(
      cli.parseDownloadOptions([
        "--from",
        "https://x.org/",
        "--dir",
        "d",
        "--announcement-sha256",
        sha,
        "--transcript-sha256",
        "CD".repeat(32),
      ]).transcriptSha256,
    ).toBe("cd".repeat(32));
    expect(
      cli.parsePublishInitOptions([
        "--dir",
        "d",
        "--coordinator",
        "https://c.org/x",
        "--ptau",
        "p",
      ]),
    ).toEqual({ dir: resolve("d"), coordinator: "https://c.org", ptau: resolve("p") });
    expect(
      cli.parsePublishFinalOptions(["--dir", "d", "--coordinator", "https://c.org/x/"]),
    ).toEqual({ dir: resolve("d"), coordinator: "https://c.org" });
    expect(cli.parseFinalizeOptions(["--dir", "d"])).toEqual({
      dir: resolve("d"),
      ptau: resolve("d/ptau/powersOfTau28_hez_final_16.ptau"),
    });
    expect(cli.parseContributeLocalOptions(["--dir", "d", "--contributors", "2"])).toMatchObject({
      contributors: 2,
      crossCheckR1cs: false,
    });
    expect(
      cli.parseVerifyOptions(["--dir", "d", "--announcement-sha256", sha, "--network", "testnet"]),
    ).toMatchObject({ network: "testnet", local: false, rebuildGenesis: false });
    expect(
      cli.parseVerifyOptions(["--dir", "d", "--announcement-sha256", sha, "--network", "testnet"]),
    ).not.toHaveProperty("transcriptSha256");
    expect(
      cli.parseVerifyOptions([
        "--dir",
        "d",
        "--announcement-sha256",
        sha,
        "--network",
        "testnet",
        "--transcript-sha256",
        "CD".repeat(32),
      ]).transcriptSha256,
    ).toBe("cd".repeat(32));
  });

  const sha256 = "ab".repeat(32);
  const pin = ["--announcement-sha256", sha256];
  it.each([
    [
      "an http coordinator",
      () =>
        cli.parsePublishInitOptions(["--dir", "d", "--coordinator", "http://c.org", "--ptau", "p"]),
      /^--coordinator must be https/,
    ],
    [
      "an http coordinator for the finals",
      () => cli.parsePublishFinalOptions(["--dir", "d", "--coordinator", "http://c.org"]),
      /^--coordinator must be https/,
    ],
    [
      "an http mirror",
      () => cli.parseDownloadOptions(["--from", "http://x.org", "--dir", "d", ...pin]),
      /^--from must be https/,
    ],
    [
      "a bad pin",
      () =>
        cli.parseVerifyOptions(["--dir", "d", "--announcement-sha256", "12", "--network", "local"]),
      /^--announcement-sha256 must be a SHA-256/,
    ],
    [
      "a bad transcript pin",
      () =>
        cli.parseVerifyOptions([
          "--dir",
          "d",
          ...pin,
          "--network",
          "local",
          "--transcript-sha256",
          "12",
        ]),
      /^--transcript-sha256 must be a SHA-256/,
    ],
    [
      "no pin",
      () => cli.parseVerifyOptions(["--dir", "d", "--network", "local"]),
      /^missing --announcement-sha256$/,
    ],
    [
      "no expected network",
      () => cli.parseVerifyOptions(["--dir", "d", ...pin]),
      /^missing --network$/,
    ],
    [
      "an unknown expected network",
      () => cli.parseVerifyOptions(["--dir", "d", ...pin, "--network", "devnet"]),
      /^--network must be one of local, testnet, mainnet$/,
    ],
    [
      "no contributors",
      () => cli.parseContributeLocalOptions(["--dir", "d", "--contributors", "0"]),
      /^--contributors must be an integer from 1 to 1000$/,
    ],
    [
      "a million contributors",
      () => cli.parseContributeLocalOptions(["--dir", "d", "--contributors", "1000000"]),
      /^--contributors must be an integer from 1 to 1000$/,
    ],
    [
      "an unknown network",
      () => cli.parseAnnounceOptions(["--dir", "d", "--network", "devnet"]),
      /^--network must be one of local, testnet, mainnet$/,
    ],
    [
      "a ceremony id that is a path",
      () =>
        cli.parseInitOptions([
          "--ceremony-id",
          "../x",
          "--circuits-repo",
          "r",
          "--circuits-ref",
          "v",
        ]),
      /^--ceremony-id must be 1–64 of \[a-z0-9-\]$/,
    ],
  ] as [string, () => unknown, RegExp][])("refuse %s as a usage error", (_, call, message) => {
    expect(call).toThrow(UsageError);
    expect(call).toThrow(message);
  });
});
