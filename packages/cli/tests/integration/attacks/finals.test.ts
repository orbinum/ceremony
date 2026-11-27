/** Attacks on the final keys: a lying VK, a final key without the beacon, a lying final record. */
import { cp } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { createSha256 } from "@orbinum-ceremony/core";
import { layout } from "../../../src/artifacts";
import { hashFile } from "../../../src/io";
import type { VerifyOptions } from "../../../src/commands/verify";
import {
  editJson,
  failures,
  finalizedCeremony,
  PTAU_PATH,
  tamperedCopy,
  type TestCeremony,
} from "../../support";

const VK = "shield: published vk.json = VK exported from the final zkey";
const REWALK = "shield: final zkey embeds the recorded contributions + sealed beacon";

describe.skipIf(!PTAU_PATH)("attacks on the final keys", { timeout: 180_000 }, () => {
  const ptau = PTAU_PATH as string;
  let ceremony: TestCeremony;
  const verify = (dir: string): VerifyOptions => ({
    dir,
    announcementSha256: ceremony.announcementSha256,
    network: "local",
    ptau,
    rebuildGenesis: false,
    local: true,
  });

  beforeAll(async () => {
    ceremony = await finalizedCeremony(ptau);
  }, 180_000);

  it("rejects a published VK with δ = γ written another way (leading zeros)", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      editJson<Record<string, string[][]>>(layout(d).finalVk("shield"), (vk) => {
        vk.vk_delta_2 = (vk.vk_gamma_2 as string[][]).map((pair) => pair.map((x) => `0${x}`));
      }),
    );
    expect(await failures(verify(copy))).toContainEqual({
      id: VK,
      status: "fail",
      detail: "vk.json differs; vk.json SHA-256 differs from the final record",
    });
  });

  it("rejects a final key without the beacon, although snarkjs verifies it", async () => {
    const copy = await tamperedCopy(ceremony.dir, async (d) => {
      await cp(layout(d).zkey("shield", 2), layout(d).finalZkey("shield"));
      const sha = await hashFile(layout(d).finalZkey("shield"), createSha256());
      await editJson<{ finals: { final_zkey_sha256: string }[] }>(layout(d).transcript, (t) => {
        (t.finals[0] as { final_zkey_sha256: string }).final_zkey_sha256 = sha;
      });
    });
    const failed = await failures(verify(copy));
    expect(failed).toContainEqual({
      id: REWALK,
      status: "fail",
      detail: "2 entries, expected 3 (2 contributions + beacon)",
    });
    expect(failed.map((f) => f.id)).not.toContain("shield: final zkey verifies from r1cs + ptau");
  });

  it("rejects a final record that lies about the contribution count", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      editJson<{ finals: { contributions: number }[] }>(layout(d).transcript, (t) => {
        (t.finals[0] as { contributions: number }).contributions = 50;
      }),
    );
    expect(await failures(verify(copy))).toContainEqual({
      id: "shield: final zkey matches the final record",
      status: "fail",
      detail: "contribution count",
    });
  });

  it("rejects a final record for a circuit the ceremony does not have", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      editJson<{ finals: { circuit: string }[] }>(layout(d).transcript, (t) => {
        t.finals.push({ ...(t.finals[0] as { circuit: string }), circuit: "evil" });
      }),
    );
    expect(await failures(verify(copy))).toContainEqual({
      id: "final records name only this ceremony's circuits",
      status: "fail",
      detail: "evil is not in init.json",
    });
  });
});
