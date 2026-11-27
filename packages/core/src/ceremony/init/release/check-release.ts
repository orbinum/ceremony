/**
 * A circuit's r1cs is the one the audited release published for its active version, and the
 * ceremony key becomes the next version.
 */
import { ceremonyVersionOf } from "./ceremony-version-of";
import type { InitCircuit, PublishedCircuit } from "../types";

export function checkRelease(
  published: PublishedCircuit,
  c: Pick<InitCircuit, "r1cs_sha256" | "ceremony_version">,
): string[] {
  const problems: string[] = [];
  if (published.r1csSha256 !== c.r1cs_sha256)
    problems.push("r1cs is not the one the release published");
  const expected = ceremonyVersionOf(published);
  if (c.ceremony_version !== expected) {
    problems.push(
      `ceremony version v${c.ceremony_version}, the release's active v${published.version} needs v${expected}`,
    );
  }
  return problems;
}
