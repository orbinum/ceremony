import type { CircuitName } from "@orbinum-ceremony/core";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api";
import { CheckFailed, contributeAll, type Progress, type RunDeps } from "../../src/contribution";
import { chain, CIRCUIT_NAMES, FakeCoordinator, flip } from "../support";

const CLIENT = { name: "test", version: "0.0.0", commit: "abcdef0" };

/** A run against `fake`, contributing `multiplier_2` on top of every head. */
function depsFor(fake: FakeCoordinator, lost: () => Error | null = () => null): RunDeps {
  const c = chain();
  return {
    api: fake,
    compute: vi.fn<RunDeps["compute"]>(async () => ({
      output: chain().output,
      contributionHash: c.contributionHash,
    })),
    csHashes: new Map(CIRCUIT_NAMES.map((circuit) => [circuit, c.csHash])),
    client: CLIENT,
    text: "my own text",
    lost,
    sleep: async () => {},
  };
}

const stagesOf = (progress: Progress[], circuit: CircuitName) =>
  progress.filter((p) => p.circuit === circuit).map((p) => p.stage);

describe("contributeAll", () => {
  it("contributes to every circuit in order, each checked, uploaded and accepted", async () => {
    const fake = new FakeCoordinator();
    const deps = depsFor(fake);
    const progress: Progress[] = [];
    const accepted = await contributeAll(deps, fake.seq, (p) => progress.push(p));

    const c = chain();
    expect(accepted.map((a) => a.circuit)).toEqual([...CIRCUIT_NAMES]);
    expect(accepted[0]).toEqual({
      circuit: CIRCUIT_NAMES[0],
      index: c.headIndex + 1,
      inputSha256: c.headSha256,
      outputSha256: c.outputSha256,
      contributionHash: c.contributionHash,
    });
    expect(fake.uploads.map((u) => u.claim.method)).toEqual(["browser", "browser", "browser"]);
    expect(fake.uploads[0]?.claim.client).toEqual(CLIENT);
    expect(deps.compute).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      String(fake.seq),
      "my own text",
    );
    expect(stagesOf(progress, "shield")).toEqual([
      "downloading",
      "computing",
      "checking",
      "uploading",
      "verifying",
      "accepted",
    ]);
  });

  it("tries a rejected circuit again while the turn offers it", async () => {
    const fake = new FakeCoordinator();
    fake.verdicts.set("unshield", ["rejected"]);
    const progress: Progress[] = [];
    const accepted = await contributeAll(depsFor(fake), fake.seq, (p) => progress.push(p));
    expect(accepted).toHaveLength(3);
    expect(fake.uploads.filter((u) => u.circuit === "unshield")).toHaveLength(2);
    expect(stagesOf(progress, "unshield")).toContain("rejected");
  });

  it("stops before uploading anything when the head is not the announced one", async () => {
    const fake = new FakeCoordinator();
    fake.headBytes = () => flip(chain().head, -1);
    await expect(contributeAll(depsFor(fake), fake.seq, () => {})).rejects.toThrow(CheckFailed);
    expect(fake.uploads).toHaveLength(0);
  });

  it("waits out a pause that refused the upload, then uploads again", async () => {
    const fake = new FakeCoordinator();
    fake.uploadErrors.push(new ApiError(409, "not-open", "not-open"));
    const accepted = await contributeAll(depsFor(fake), fake.seq, () => {});
    expect(accepted).toHaveLength(3);
    expect(fake.uploads).toHaveLength(3);
  });

  it("does not go on once the turn is lost", async () => {
    const fake = new FakeCoordinator();
    const lost = new Error("your turn ended");
    await expect(
      contributeAll(
        depsFor(fake, () => lost),
        fake.seq,
        () => {},
      ),
    ).rejects.toBe(lost);
    expect(fake.uploads).toHaveLength(0);
  });

  it("reports a paused ceremony and contributes once it resumes", async () => {
    const fake = new FakeCoordinator();
    fake.phase = "PAUSED";
    const deps = depsFor(fake);
    deps.sleep = async () => {
      fake.phase = "OPEN";
    };
    const progress: Progress[] = [];
    await contributeAll(deps, fake.seq, (p) => progress.push(p));
    expect(progress[0]).toEqual({ circuit: null, stage: "paused" });
    expect(fake.uploads).toHaveLength(3);
  });

  it("reports an upload of an earlier run accepted meanwhile, without claiming its hashes", async () => {
    const fake = new FakeCoordinator();
    // A reload left shield's upload in verification.
    await fake.uploadContribution("shield", new Uint8Array([1]), {
      inputSha256: "aa".repeat(32),
      outputSha256: "bb".repeat(32),
    } as Parameters<FakeCoordinator["uploadContribution"]>[2]);
    const progress: Progress[] = [];
    const accepted = await contributeAll(depsFor(fake), fake.seq, (p) => progress.push(p));
    expect(progress).toContainEqual({ circuit: "shield", stage: "accepted" });
    expect(accepted.map((a) => a.circuit)).toEqual(["unshield", "transfer"]);
  });

  it("zeroes the bytes it held", async () => {
    const fake = new FakeCoordinator();
    const served: Uint8Array[] = [];
    fake.headBytes = () => {
      const bytes = chain().head;
      served.push(bytes);
      return bytes;
    };
    await contributeAll(depsFor(fake), fake.seq, () => {});
    expect(served.every((b) => b.every((x) => x === 0))).toBe(true);
  });
});
