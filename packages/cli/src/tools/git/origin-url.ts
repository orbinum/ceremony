/** The URL a clone's `origin` remote fetches from. */
import { run } from "../process";

export const originUrl = async (repo: string): Promise<string> =>
  (await run("git", ["-C", repo, "remote", "get-url", "origin"])).trim();
