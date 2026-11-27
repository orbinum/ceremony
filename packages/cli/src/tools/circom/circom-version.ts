/** The version of the circom on PATH, to compare with the pinned compiler. */
import { run } from "../process";

export async function circomVersion(): Promise<string> {
  const out = await run("circom", ["--version"]);
  const version = /(\d+\.\d+\.\d+)/.exec(out)?.[1];
  if (!version) throw new Error("cannot parse the circom version");
  return version;
}
