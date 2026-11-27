/**
 * The full commit id a ref (tag or commit) points to in a clone, read-only. `--end-of-options`
 * stops refs that look like options; the result is validated as a 40-hex id before it is used
 * anywhere else.
 */
import { asCommit } from "@orbinum-ceremony/core";
import { run } from "../process";

export const resolveCommit = async (repo: string, ref: string): Promise<string> =>
  asCommit(
    (
      await run("git", ["-C", repo, "rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])
    ).trim(),
    `git ref ${ref}`,
  );
