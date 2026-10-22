/**
 * An audited circuits release in the verifier's own clone: the tag, the commit it resolves to, and
 * what its `manifest.json` published (read by core). SPEC §2.1.
 */
import {
  type CircuitName,
  type PublishedCircuit,
  readReleaseManifest,
} from "@orbinum-ceremony/core";
import { resolveCommit, showFile } from "../tools";

/** An audited circuits release: a tag, the commit it resolves to, and its published manifest. */
export interface CircuitRelease {
  repo: string;
  tag: string;
  commit: string;
  /** Active version and published r1cs SHA-256 of a circuit, from `manifest.json` at `commit`. */
  published(name: CircuitName): PublishedCircuit;
}

/**
 * Resolves `tag` in the verifier's own clone of the circuits repo. When `expectedCommit` is given
 * (the one the announcement pins), the tag must resolve to it: building "the commit named in
 * init.json" would let a coordinator point at any branch or old commit.
 */
export async function resolveRelease(
  repo: string,
  tag: string,
  expectedCommit?: string,
): Promise<CircuitRelease> {
  // Only a tag: a branch, HEAD or a commit id would bind the announcement to nothing.
  const commit = await resolveCommit(repo, `refs/tags/${tag}`);
  if (expectedCommit !== undefined && commit !== expectedCommit) {
    throw new Error(`tag ${tag} resolves to ${commit}, not the announced ${expectedCommit}`);
  }
  const published = readReleaseManifest(await showFile(repo, commit, "manifest.json"));
  return { repo, tag, commit, published };
}

/**
 * A git remote URL as `host/path`, lowercase, without credentials, scheme, `.git` or trailing
 * slash: `git@github.com:o/r.git`, `ssh://git@github.com/o/r` and `https://github.com/o/r` are
 * one repository. Anything else is returned as given, lowercase.
 */
export function repoId(url: string): string {
  const scp = /^[^/@:]+@([^/:]+):(.+)$/.exec(url);
  let id = scp ? `${scp[1]}/${scp[2]}` : url;
  const parsed = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?(.+)$/i.exec(id);
  if (parsed) id = parsed[1] as string;
  return id
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .toLowerCase();
}
