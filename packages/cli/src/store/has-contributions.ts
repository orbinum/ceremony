/** Whether any circuit has a contribution file on disk (every directory under `contributions/`). */
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { layout } from "../artifacts";

export async function hasContributions(dir: string): Promise<boolean> {
  const root = layout(dir).allContributions;
  if (!existsSync(root)) return false;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if ((await readdir(join(root, entry.name))).length > 0) return true;
  }
  return false;
}
