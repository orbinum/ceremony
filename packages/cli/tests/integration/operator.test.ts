/**
 * Operator commands with the real ptau against their peers: a fake coordinator, a local mirror. The
 * beacon is deterministic, so a rebuilt final key has the same bytes: a refused finalize must leave
 * final/ as the very same files (same inode), never rewritten.
 */
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CEREMONY_LAYOUT,
  type SetupInput,
  sha256Hex,
  type Transcript,
} from "@orbinum-ceremony/core";
import { beforeAll, describe, expect, it } from "vitest";
import { layout } from "../../src/artifacts";
import { runContributeLocal } from "../../src/commands/contribute-local";
import { runDownload } from "../../src/commands/download";
import { runFinalize } from "../../src/commands/finalize";
import { runInit } from "../../src/commands/init";
import { runPublishInit } from "../../src/commands/publish-init";
import {
  CLOCK,
  editJson,
  finalizedCeremony,
  json,
  localServer,
  PTAU_PATH,
  serveDir,
  shieldOnlyCeremony,
  tamperedCopy,
  type TestCeremony,
} from "../support";

async function mirror(dir: string) {
  const server = await serveDir(dir);
  const out = await mkdtemp(join(tmpdir(), "orbinum-mirror-"));
  return { server, out };
}

describe.skipIf(!PTAU_PATH)("operator commands against their peers", { timeout: 180_000 }, () => {
  const ptau = PTAU_PATH as string;
  let ceremony: TestCeremony;

  beforeAll(async () => {
    ceremony = await finalizedCeremony(ptau);
  }, 180_000);

  describe("publish-init", () => {
    it("uploads the bytes it checked, the announcement last, then configures", async () => {
      const coordinator = await localServer({
        "/admin/configure": (_q, res) => json(res, 200, { ok: true }),
        "*": (req, res) =>
          json(res, 201, { ok: true, key: (req.url ?? "").replace("/admin/artifacts/", "") }),
      });
      try {
        const sha = await runPublishInit({ dir: ceremony.dir, coordinator: coordinator.url, ptau });
        expect(sha).toBe(ceremony.announcementSha256);
        const puts = coordinator.requests.filter((r) => r.method === "PUT");
        expect(puts.map((r) => r.path.replace("/admin/artifacts/", ""))).toEqual([
          CEREMONY_LAYOUT.init,
          CEREMONY_LAYOUT.r1cs("shield"),
          CEREMONY_LAYOUT.zkey("shield", 0),
          CEREMONY_LAYOUT.ptau,
          CEREMONY_LAYOUT.announcement,
        ]);
        for (const r of puts) expect(r.headers["x-content-sha256"]).toBe(sha256Hex(r.body));
        const configure = coordinator.requests.at(-1);
        expect(configure?.path).toBe("/admin/configure");
        const setup = JSON.parse(String(configure?.body)) as SetupInput;
        expect(setup.announcement).toBe(await readFile(layout(ceremony.dir).announcement, "utf8"));
      } finally {
        await coordinator.close();
      }
    });

    it("stops at the first answer that is not the coordinator's ok, before the announcement", async () => {
      const proxy = await localServer({
        "*": (_q, res) => res.writeHead(200, { "content-type": "text/html" }).end("<html>login"),
      });
      try {
        await expect(
          runPublishInit({ dir: ceremony.dir, coordinator: proxy.url, ptau }),
        ).rejects.toThrow(/not a JSON answer/);
        expect(proxy.requests.map((r) => r.path)).toEqual([
          `/admin/artifacts/${CEREMONY_LAYOUT.init}`,
        ]);
      } finally {
        await proxy.close();
      }
    });

    it("stops when the coordinator stored another key than the one sent", async () => {
      const coordinator = await localServer({
        "*": (_q, res) => json(res, 201, { ok: true, key: "x" }),
      });
      try {
        await expect(
          runPublishInit({ dir: ceremony.dir, coordinator: coordinator.url, ptau }),
        ).rejects.toThrow(`PUT ${CEREMONY_LAYOUT.init}: the coordinator stored another key`);
        expect(coordinator.requests).toHaveLength(1);
      } finally {
        await coordinator.close();
      }
    });

    it("uploads nothing when a pinned file does not match", async () => {
      const copy = await tamperedCopy(ceremony.dir, (d) =>
        writeFile(layout(d).zkey("shield", 0), "not the genesis"),
      );
      const coordinator = await localServer({ "*": (_q, res) => json(res, 200, { ok: true }) });
      try {
        await expect(
          runPublishInit({ dir: copy, coordinator: coordinator.url, ptau }),
        ).rejects.toThrow(/genesis does not match init\.json/);
        expect(coordinator.requests).toEqual([]);
      } finally {
        await coordinator.close();
      }
    });
  });

  describe("download", () => {
    it("mirrors a published ceremony, every file checked", async () => {
      const { server, out } = await mirror(ceremony.dir);
      try {
        const count = await runDownload({
          from: server.url,
          dir: out,
          announcementSha256: ceremony.announcementSha256,
          withPtau: false,
          force: false,
        });
        expect(count).toBe(11);
        expect(await readFile(layout(out).finalZkey("shield"))).toEqual(
          await readFile(layout(ceremony.dir).finalZkey("shield")),
        );
      } finally {
        await server.close();
        await rm(out, { recursive: true, force: true });
      }
    });

    it("fetches nothing a transcript names unless it is anchored and its chain intact", async () => {
      for (const tamper of [
        (t: Transcript) => {
          t.anchor.sha256 = "00".repeat(32);
        },
        (t: Transcript) => {
          (t.records[0] as { chain: string }).chain = "00".repeat(32);
        },
      ]) {
        const copy = await tamperedCopy(ceremony.dir, (d) =>
          editJson(layout(d).transcript, tamper),
        );
        const { server, out } = await mirror(copy);
        try {
          await expect(
            runDownload({
              from: server.url,
              dir: out,
              announcementSha256: ceremony.announcementSha256,
              withPtau: false,
              force: false,
            }),
          ).rejects.toThrow(/transcript\.json refused/);
          expect(server.requests.some((r) => r.path.startsWith("/contributions/"))).toBe(false);
          expect(existsSync(layout(out).transcript)).toBe(false);
        } finally {
          await server.close();
        }
      }
    });
  });

  describe("finalize", () => {
    it("refuses a finalizable testnet ceremony without a vk packer before sealing anything", async () => {
      const testnet = await shieldOnlyCeremony(ptau, "testnet");
      await runContributeLocal(
        { dir: testnet.dir, ptau, contributors: 2, crossCheckR1cs: false },
        CLOCK.contribute,
      );
      const before = await readFile(layout(testnet.dir).transcript);
      await expect(runFinalize({ dir: testnet.dir, ptau }, CLOCK.finalize)).rejects.toThrow(
        "--vk-packer is required: vk_hash is mandatory outside local ceremonies",
      );
      expect(await readFile(layout(testnet.dir).transcript)).toEqual(before);
    });

    it("leaves final/ and the recorded finals untouched when a circuit fails midway", async () => {
      const copy = await tamperedCopy(ceremony.dir, async () => undefined);
      const packer = join(copy, "failing-packer.sh");
      await writeFile(packer, "#!/bin/sh\necho broken >&2\nexit 1\n");
      await chmod(packer, 0o755);
      const finalBefore = await stat(layout(copy).finalZkey("shield"));
      const transcriptBefore = await readFile(layout(copy).transcript, "utf8");
      await expect(
        runFinalize({ dir: copy, ptau, vkPacker: packer }, CLOCK.finalize),
      ).rejects.toThrow(/failing-packer\.sh failed \(exit 1\): broken/);
      expect((await stat(layout(copy).finalZkey("shield"))).ino).toBe(finalBefore.ino);
      expect(await readFile(layout(copy).transcript, "utf8")).toBe(transcriptBefore);
      expect(await readdir(copy)).not.toContain("final.tmp");
    });

    it("refuses a vk packer that is not executable before sealing", async () => {
      const copy = await tamperedCopy(ceremony.dir, async () => undefined);
      await expect(
        runFinalize({ dir: copy, ptau, vkPacker: join(copy, "missing") }, CLOCK.finalize),
      ).rejects.toThrow("missing is not an executable file");
    });
  });

  describe("init", () => {
    it("never rebuilds a ceremony that has contributions, even with --force", async () => {
      const options = {
        ceremonyId: "e2e-local",
        circuitsRepo: "/nonexistent",
        circuitsRef: "v0.16.0",
        circuits: [{ name: "shield", circuitId: 3 }],
        out: ceremony.dir,
        checkDeterminism: false,
        beyondMeasuredBounds: false,
      };
      for (const force of [false, true]) {
        await expect(runInit({ ...options, force })).rejects.toThrow(
          /already has contributions: it cannot be rebuilt/,
        );
      }
    });
  });
});
