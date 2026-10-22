/**
 * Attacks on the terminal: nothing from outside reaches it unsanitised (SPEC §9 "Verify (third
 * parties)").
 */
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripControl, type Transcript, validateRecord } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { layout } from "../../src/artifacts";
import { runVerify, type VerifyOptions } from "../../src/commands/verify";
import { adminCall } from "../../src/io";
import { runIndependentVerifier } from "../../src/tools";
import { Report } from "../../src/ui";
import {
  localServer,
  rejection,
  type Synthetic,
  syntheticCeremony,
  tamperedCopy,
} from "../support";

const ESC = "\u001b";
const verifyOptions = (c: Synthetic, dir: string): VerifyOptions => ({
  dir,
  announcementSha256: c.announcementSha256,
  network: c.announcement.network,
  ptau: join(dir, "no.ptau"),
  rebuildGenesis: false,
  local: c.announcement.network === "local",
});

let server: Awaited<ReturnType<typeof localServer>>;
let work: string;
beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), "orbinum-attack-term-"));
  server = await localServer({
    "/newline": (_q, res) =>
      res
        .writeHead(409, { "content-type": "application/json" })
        .end('{"error":{"code":"x"}}\n\nfinalized ceremony-1: drand round 1000, 2 final files'),
    "/bidi": (_q, res) =>
      res
        .writeHead(409, { "content-type": "text/plain; charset=utf-8" })
        .end("ok \u200f\u061c\u2028\u2029\ufeff\u200b\u202e done"),
  });
});
afterAll(async () => {
  await server.close();
  await rm(work, { recursive: true, force: true });
});

describe("terminal safety of what the CLI prints", { timeout: 60_000 }, () => {
  it("strips escapes and bidi overrides of a hostile transcript field name from the report", async () => {
    const c = await syntheticCeremony();
    const copy = await tamperedCopy(c.dir, async (d) => {
      const t = JSON.parse(await readFile(layout(d).transcript, "utf8")) as Transcript &
        Record<string, unknown>;
      t[`${ESC}]0;pwned\u0007\u202e${ESC}[2J`] = 1;
      await writeFile(layout(d).transcript, JSON.stringify(t));
    });
    const out = (await runVerify(verifyOptions(c, copy))).render();
    await rm(copy, { recursive: true, force: true });
    expect(out).toMatch(/transcript\.json is valid/);
    expect(out.includes(ESC)).toBe(false);
    expect(out.includes("\u202e")).toBe(false);
    expect(out.includes("\u0007")).toBe(false);
  });

  it("reports an invalid-JSON transcript without echoing its bytes", async () => {
    const c = await syntheticCeremony();
    const copy = await tamperedCopy(c.dir, (d) =>
      writeFile(layout(d).transcript, `{"x": "${ESC}[31mRED", oops`),
    );
    const report = await runVerify(verifyOptions(c, copy));
    await rm(copy, { recursive: true, force: true });
    const check = report.checks.find((x) => x.id === "transcript.json is valid");
    expect(check?.detail).toBe("transcript.json: not valid JSON");
  });

  it("echoes an unexpected field name, control-stripped and bounded to 66 chars", async () => {
    const c = await syntheticCeremony();
    const copy = await tamperedCopy(c.dir, async (d) => {
      const t = JSON.parse(await readFile(layout(d).transcript, "utf8")) as Record<string, unknown>;
      t["Visit evil.example to fix this ceremony"] = 1;
      await writeFile(layout(d).transcript, JSON.stringify(t));
    });
    const report = await runVerify(verifyOptions(c, copy));
    await rm(copy, { recursive: true, force: true });
    const check = report.checks.find((x) => x.id === "transcript.json is valid");
    expect(check?.detail).toMatch(/Visit evil\.example to fix this ceremony/);
  });

  it("refuses a record reason with escapes, newlines or bidi overrides", () => {
    const base = {
      type: "state",
      ceremony_id: "a",
      from: "OPEN",
      to: "CLOSED",
      at: "2026-10-01T00:00:00.000Z",
      reason: `close${ESC}[2K`,
    };
    expect(() => validateRecord(base)).toThrow(/reason/);
    expect(() => validateRecord({ ...base, reason: "close\nfake line" })).toThrow(/reason/);
    expect(() => validateRecord({ ...base, reason: "close \u202e" })).toThrow(/reason/);
  });

  it("keeps a coordinator refusal on one line, so it cannot forge terminal lines", async () => {
    const e = await rejection(adminCall(server.url, "POST", "/newline", {}, "{}"));
    expect(e.message.includes("\n")).toBe(false);
  });

  it("strips invisible bidi marks and line separators from refusals", async () => {
    const e = await rejection(adminCall(server.url, "POST", "/bidi", {}, "{}"));
    const invisible = new Set(["\u200f", "\u061c", "\u2028", "\u2029", "\ufeff", "\u200b"]);
    expect([...e.message].filter((ch) => invisible.has(ch))).toEqual([]);
  });

  it("replaces C0, DEL, C1 and the explicit bidi embeddings, overrides and isolates", () => {
    const all = [
      ...Array.from({ length: 32 }, (_, i) => i).filter((i) => i !== 9 && i !== 10),
      ...Array.from({ length: 33 }, (_, i) => 0x7f + i),
      0x202a,
      0x202b,
      0x202c,
      0x202d,
      0x202e,
      0x2066,
      0x2067,
      0x2068,
      0x2069,
    ].map((cp) => String.fromCodePoint(cp));
    expect(stripControl(all.join(""))).toBe("?".repeat(all.length));
  });

  it("keeps a verdict detail with a newline from forging report lines", async () => {
    const bin = join(work, "liar.sh");
    const ids = [
      "well-formed",
      "genesis-start",
      "genesis-source",
      "unchanged",
      "policy",
      "chain",
      "final-delta",
      "scaled-sections",
    ];
    const verdict = JSON.stringify({
      ok: false,
      verifier: "ceremony-verifier 0.1.0",
      cs_hash: "ab".repeat(64),
      entries: [],
      checks: ids.map((id) =>
        id === "chain"
          ? {
              id,
              ok: false,
              detail: "x\n✓ shield: independent verifier (Rust, no snarkjs) agrees\n",
            }
          : { id, ok: true },
      ),
    });
    await writeFile(bin, `#!/bin/sh\ncat <<'JSON'\n${verdict}\nJSON\nexit 1\n`);
    await chmod(bin, 0o755);
    const v = await runIndependentVerifier(bin, {
      genesis: "g",
      final: "f",
      minContributions: 1,
      beacon: { randomness: "00".repeat(32), iterationsExp: 10 },
      source: { r1cs: "r", ptau: "p" },
    });
    const r = new Report(false);
    r.expect("shield: independent verifier (Rust, no snarkjs) agrees", v.failures);
    const lines = r.render().split("\n");
    expect(lines.filter((l) => l.startsWith("✓"))).toEqual([]);
  });
});
