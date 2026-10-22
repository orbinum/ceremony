/**
 * `vk_hash`, the value `@orbinum/circuits` records in its manifest and the chain stores: core's
 * `vkHashOf` over the VK packed by `pack-verifying-key` (`groth16-proofs` repo). SPEC §6.4.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vkHashOf } from "@orbinum-ceremony/core";
import { readBytes } from "../io";
import { assertExecutable, run } from "./process";

/** The vk_hash of a vk.json, through the packer. */
export async function packedVkHash(packer: string, vkJson: string): Promise<string> {
  await assertExecutable(packer);
  const dir = await mkdtemp(join(tmpdir(), "orbinum-vk-"));
  try {
    const out = join(dir, "vk.bin");
    await run(packer, [vkJson, out]);
    return vkHashOf(await readBytes(out));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
