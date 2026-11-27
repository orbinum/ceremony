/**
 * Resolves a release tag in the verifier's own clone of the circuits repo and reads its
 * `manifest.json` with core. Only a tag: a branch, HEAD or a commit id would bind the announcement
 * to nothing. When `expectedCommit` is given (the one the announcement pins), the tag must resolve
 * to it: building "the commit named in init.json" would let a coordinator point at any branch or
 * old commit.
 */
import { readReleaseManifest } from "@orbinum-ceremony/core";
import { resolveCommit, showFile } from "../tools";
import type { CircuitRelease } from "./types";

export async function resolveRelease(
  repo: string,
  tag: string,
  expectedCommit?: string,
): Promise<CircuitRelease> {
  const commit = await resolveCommit(repo, `refs/tags/${tag}`);
  if (expectedCommit !== undefined && commit !== expectedCommit) {
    throw new Error(`tag ${tag} resolves to ${commit}, not the announced ${expectedCommit}`);
  }
  const published = readReleaseManifest(await showFile(repo, commit, "manifest.json"));
  return { repo, tag, commit, published };
}
