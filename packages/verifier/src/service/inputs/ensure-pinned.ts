/**
 * `checkPins`, staging the copies again from their sources first when one is gone: a temp-dir
 * cleaner may remove them during a long pause. The new copies are pinned like the first ones. The
 * stage is touched first: it is in use, and another instance's startup sweep only removes stages
 * left untouched for hours.
 */
import { utimes } from "node:fs/promises";
import { checkPins } from "./check-pins";
import { stageCopies } from "./stage-copies";
import type { Inputs } from "./types";

export async function ensurePinned(inputs: Inputs): Promise<void> {
  const now = new Date();
  await utimes(inputs.stage.dir, now, now).catch(() => {});
  try {
    await checkPins(inputs);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== "ENOENT") throw error;
    const old = inputs.stage;
    Object.assign(inputs, await stageCopies(inputs.init, inputs.sources));
    await old.cleanup().catch(() => {});
    await checkPins(inputs);
  }
}
