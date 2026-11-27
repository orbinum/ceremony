/** A file's content at a commit of a clone, without touching the working tree. */
import { asCommit } from "@orbinum-ceremony/core";
import { run } from "../process";

export const showFile = (repo: string, commit: string, path: string): Promise<string> =>
  run("git", ["-C", repo, "show", `${asCommit(commit, "commit")}:${path}`]);
