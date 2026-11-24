/**
 * CI clones the circuits repo by the commit the tests pin, never by a ref name someone could move,
 * in a job of its own (the only one that sees its token), and installs it as data (no install
 * scripts, no pnpmfile).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASE } from "./support";

const ci = () =>
  readFile(join(import.meta.dirname, "..", "..", "..", ".github/workflows/ci.yml"), "utf8");

describe("CI pins", () => {
  it("checks out orbinum/circuits at the pinned release commit", async () => {
    const text = await ci();
    const clone = text.slice(text.indexOf("repository: orbinum/circuits"));
    expect(/ref: ([0-9a-f]{40})/.exec(clone)?.[1]).toBe(RELEASE.commit);
  });

  it("references the circuits token only in the job that clones, which runs no repository code", async () => {
    const text = await ci();
    expect(text.match(/secrets\.CIRCUITS_READ_TOKEN/g)).toHaveLength(1);
    const job = text.slice(text.indexOf("\n  circuits:"), text.indexOf("\n  test:"));
    expect(job).toContain("secrets.CIRCUITS_READ_TOKEN");
    // Only the checkout and the artifact upload: no install, no script, no repository code.
    expect(job.match(/uses: /g)).toHaveLength(2);
    expect(job).not.toMatch(/\brun: /);
  });

  it("installs the clone without its scripts, pnpmfile or package-manager switch", async () => {
    const text = await ci();
    const install = text.slice(text.indexOf("pnpm --dir .test-inputs/circuits install"));
    for (const flag of [
      "--ignore-scripts",
      "--ignore-pnpmfile",
      "--config.manage-package-manager-versions=false",
    ]) {
      expect(install.slice(0, 300)).toContain(flag);
    }
  });
});
