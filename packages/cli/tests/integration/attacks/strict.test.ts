/**
 * Strict (non-local) verification: every external binding is required, vk_hash included. A testnet
 * ceremony must be verified in full, so a skipped security check is a failure.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { layout } from "../../../src/artifacts";
import type { VerifyOptions } from "../../../src/commands/verify";
import {
  CIRCUITS_REPO,
  editJson,
  failedChecks,
  failures,
  finalizedCeremony,
  PTAU_PATH,
  RUST_VERIFIER,
  tamperedCopy,
  type TestCeremony,
  VK_PACKER,
} from "../../support";

describe.skipIf(!PTAU_PATH || !VK_PACKER)(
  "strict verification (non-local)",
  { timeout: 300_000 },
  () => {
    const ptau = PTAU_PATH as string;
    let ceremony: TestCeremony;
    const verify = (dir: string, extra: Partial<VerifyOptions> = {}): VerifyOptions => ({
      dir,
      announcementSha256: ceremony.announcementSha256,
      network: "testnet",
      ptau,
      rebuildGenesis: false,
      local: false,
      ...extra,
    });

    beforeAll(async () => {
      ceremony = await finalizedCeremony(ptau, "testnet");
    }, 180_000);

    it("fails when the bindings that need external inputs are not checked", async () => {
      const failed = await failedChecks(verify(ceremony.dir));
      expect(failed.toSorted()).toEqual(
        [
          "circuits clone's origin is the announced repo",
          "announced tag resolves to the announced commit",
          "shield: r1cs is the one the release published, at the next version",
          "shield: r1cs rebuilt from the release is identical",
          "shield: vk_hash = blake2_256(packed VK)",
          "shield: independent verifier (Rust, no snarkjs) agrees",
        ].toSorted(),
      );
    });

    it("refuses --local for a testnet ceremony", async () => {
      expect(await failedChecks(verify(ceremony.dir, { local: true }))).toEqual([
        "verification mode matches the announced network",
      ]);
    });

    it("fails when the final record carries no vk_hash", async () => {
      const copy = await tamperedCopy(ceremony.dir, (d) =>
        editJson<{ finals: { vk_hash: string | null }[] }>(layout(d).transcript, (t) => {
          (t.finals[0] as { vk_hash: string | null }).vk_hash = null;
        }),
      );
      const failed = await failures(verify(copy, { vkPacker: VK_PACKER as string }));
      expect(failed).toContainEqual({
        id: "shield: final zkey matches the final record",
        status: "fail",
        detail: "vk_hash is null",
      });
    });

    it("fails when vk_hash is not the hash of the published VK", async () => {
      const copy = await tamperedCopy(ceremony.dir, (d) =>
        editJson<{ finals: { vk_hash: string | null }[] }>(layout(d).transcript, (t) => {
          (t.finals[0] as { vk_hash: string | null }).vk_hash = `0x${"ab".repeat(32)}`;
        }),
      );
      expect(await failedChecks(verify(copy, { vkPacker: VK_PACKER as string }))).toContain(
        "shield: vk_hash = blake2_256(packed VK)",
      );
    });

    it.skipIf(!CIRCUITS_REPO || !RUST_VERIFIER)(
      "passes in full with every external input",
      async () => {
        const failed = await failedChecks(
          verify(ceremony.dir, {
            circuitsRepo: CIRCUITS_REPO as string,
            vkPacker: VK_PACKER as string,
            rustVerifier: RUST_VERIFIER as string,
          }),
        );
        expect(failed).toEqual([]);
      },
    );
  },
);
