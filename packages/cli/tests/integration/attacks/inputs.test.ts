/** Attacks on the frozen inputs: r1cs, init.json, circuit names, links, the ptau, the release. */
import { copyFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "@orbinum-ceremony/core";
import { beforeAll, describe, expect, it } from "vitest";
import { layout } from "../../../src/artifacts";
import type { VerifyOptions } from "../../../src/commands/verify";
import { readBytes } from "../../../src/io";
import {
  CIRCUITS_REPO,
  editJson,
  failedChecks,
  failures,
  finalizedCeremony,
  PTAU_PATH,
  tamperedCopy,
  type TestCeremony,
} from "../../support";

const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures");
const COVERAGE = "init.json covers exactly the pinned circuits and tooling";

describe.skipIf(!PTAU_PATH)("attacks on the frozen inputs", { timeout: 300_000 }, () => {
  const ptau = PTAU_PATH as string;
  let ceremony: TestCeremony;
  const verify = (dir: string, extra: Partial<VerifyOptions> = {}): VerifyOptions => ({
    dir,
    announcementSha256: ceremony.announcementSha256,
    network: "local",
    ptau,
    rebuildGenesis: false,
    local: true,
    ...extra,
  });

  beforeAll(async () => {
    ceremony = await finalizedCeremony(ptau);
  }, 180_000);

  it("rejects a substituted r1cs (another circuit)", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      copyFile(join(FIXTURES, "multiplier.r1cs"), layout(d).r1cs("shield")),
    );
    expect(await failures(verify(copy))).toContainEqual({
      id: "shield: r1cs matches init.json and the pinned shape",
      status: "fail",
      detail: "SHA-256 differs from init.json",
    });
  });

  it("rejects an init.json other than the announced one, even if self-consistent", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      editJson<{ created_at: string }>(layout(d).init, (init) => {
        init.created_at = "2020-01-01T00:00:00.000Z";
      }),
    );
    expect(await failures(verify(copy))).toContainEqual({
      id: "init.json is the announced one (bytes, ceremony, circuits commit)",
      status: "fail",
      detail: "init.json is not the one ceremony.json announced",
    });
  });

  it("rejects a path-traversal circuit name before touching the filesystem", async () => {
    const before = await readdir(tmpdir());
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      editJson<{ circuits: { name: string }[] }>(layout(d).init, (init) => {
        init.circuits.push({ ...init.circuits[0], name: "../../escape" } as { name: string });
      }),
    );
    expect(await failedChecks(verify(copy, { rebuildGenesis: true }))).toEqual([
      "init.json is valid",
    ]);
    const created = (await readdir(tmpdir())).filter(
      (f) => !before.includes(f) && f.includes("escape"),
    );
    expect(created).toEqual([]);
    await rm(copy, { recursive: true, force: true });
  });

  it("rejects a final zkey replaced by a symlink", async () => {
    const copy = await tamperedCopy(ceremony.dir, async (d) => {
      const target = layout(d).finalZkey("shield");
      await rm(target);
      await symlink(layout(d).zkey("shield", 2), target);
    });
    expect(await failures(verify(copy))).toContainEqual({
      id: "shield: inputs are regular files (r1cs, genesis, final zkey, vk)",
      status: "fail",
      detail: expect.stringMatching(/^ELOOP: /),
    });
  });

  it("rejects a ptau that is not the pinned one", async () => {
    const failed = await failures(
      verify(ceremony.dir, { ptau: layout(ceremony.dir).r1cs("shield") }),
    );
    expect(failed).toContainEqual({
      id: "ptau matches the pinned BLAKE2b-512",
      status: "fail",
      detail: expect.stringMatching(/^ptau size \d+, expected 75580568$/),
    });
  });

  describe.skipIf(!CIRCUITS_REPO)("with the verifier's own circuits clone", () => {
    it("binds the r1cs to the announced release: published and rebuilt from source", async () => {
      const failed = await failedChecks(
        verify(ceremony.dir, { circuitsRepo: CIRCUITS_REPO as string }),
      );
      expect(failed).toEqual([COVERAGE]);
    });

    it("rejects an announcement whose commit is not what its tag resolves to", async () => {
      let pin = "";
      const copy = await tamperedCopy(ceremony.dir, async (d) => {
        await editJson<{ circuits_source: { tag: string } }>(layout(d).announcement, (a) => {
          a.circuits_source.tag = "v0.15.0";
        });
        pin = sha256Hex(await readBytes(layout(d).announcement));
      });
      const failed = await failures(
        verify(copy, { announcementSha256: pin, circuitsRepo: CIRCUITS_REPO as string }),
      );
      expect(failed).toContainEqual({
        id: "announced tag resolves to the announced commit",
        status: "fail",
        detail: expect.stringMatching(
          /^tag v0\.15\.0 resolves to [0-9a-f]{40}, not the announced /,
        ),
      });
    });
  });
});
