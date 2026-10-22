/**
 * A whole ceremony through the real stack (CEREMONY_PLAN Phase 3 M5), flow by flow (F1–F12), each
 * with its attacks: `wrangler dev` runs the coordinator, the verifier service checks every upload
 * with snarkjs, contributors act as the browser and CLI clients will, and the operator downloads,
 * finalizes, hands the finalization over and verifies from nothing but what was published.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  runContribute,
  runDownload,
  runFinalize,
  runPublishFinal,
  runVerify,
  type VerifyOptions,
} from "@orbinum-ceremony/cli";
import {
  ADMIN_PATHS,
  type Chained,
  CIRCUIT_ORDER,
  type ContributionRecord,
  CONTRIBUTOR_PATHS,
  OPERATOR_HEADER,
  roundTime,
  signedRequestInit,
  type Transcript,
  verifyChain,
} from "@orbinum-ceremony/core";
import { verifyFromInit } from "@orbinum-ceremony/verifier";
import { Wallet } from "ethers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Contributor, type Stack, startStack } from "./support";

/** The real ptau and a ceremony directory with all three genesis keys (a testnet rehearsal). */
const PTAU = process.env.ORBINUM_PTAU;
const CEREMONY_DIR = process.env.ORBINUM_REHEARSAL_DIR;
/** Finalization waits for a real drand round on the public relays: opt in. */
const LIVE_DRAND = process.env.ORBINUM_E2E_LIVE_DRAND === "1";
/** The contribution window, counted from when both services answer. */
const OPEN_FOR_MS = Number(process.env.ORBINUM_E2E_OPEN_FOR_MS ?? 300_000);
/** What one three-circuit session needs at most, checked before each one starts. */
const SESSION_BUDGET_MS = 60_000;

describe.skipIf(!PTAU || !CEREMONY_DIR)("end-to-end ceremony", { timeout: 1_800_000 }, () => {
  let stack: Stack;
  let base = "";
  const ptau = PTAU as string;
  const people = new Map<number, Contributor>();
  /** Sessions later flows refer to: the first contributor's, and the one attested late. */
  const sessions: { first?: number; late?: number } = {};
  /** A contributor by GitHub id, created (and its wallet) once. */
  const person = (id: number, method: "browser" | "cli" = "browser") => {
    if (!people.has(id)) {
      const c = new Contributor(base, stack.ceremonyId, id, method, stack.work, () =>
        stack.verifier.stderr(),
      );
      people.set(id, c);
    }
    return people.get(id) as Contributor;
  };
  const records = async () =>
    (await (await fetch(`${base}/api/transcript`)).json()) as {
      chainGenesis: string;
      records: Chained[];
    };
  const accepted = async () =>
    (await records()).records.filter(
      (r): r is Chained<ContributionRecord> => r.type === "contribution",
    );
  const admin = (path: string, body: unknown, operator = true) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(operator ? { [OPERATOR_HEADER]: "1" } : {}),
      },
      body: JSON.stringify(body),
    });
  const operatorText = (key: string) => readFile(join(stack.operator, key), "utf8");
  const phase = async () =>
    ((await (await fetch(`${base}/api/status`)).json()) as { phase: string }).phase;
  const session = () => {
    expect(
      stack.remaining(),
      "the contribution window is too short for another session",
    ).toBeGreaterThan(SESSION_BUDGET_MS);
  };
  const verifyOptions = (dir: string): VerifyOptions => ({
    dir,
    announcementSha256: stack.announcementSha256,
    network: "local",
    ptau,
    rebuildGenesis: false,
    local: true,
  });

  beforeAll(async () => {
    stack = await startStack(CEREMONY_DIR as string, ptau, OPEN_FOR_MS);
    base = stack.coordinator.url;
  }, 600_000);

  afterAll(async () => {
    for (const c of people.values()) c.end();
    await stack?.stop();
  });

  it("F1: keeps the published setup immutable and configured once", async () => {
    const other = new TextEncoder().encode("{}\n");
    const put = await fetch(`${base}${ADMIN_PATHS.artifact("genesis/init.json")}`, {
      method: "PUT",
      headers: {
        [OPERATOR_HEADER]: "1",
        "x-content-sha256": Buffer.from(await crypto.subtle.digest("SHA-256", other)).toString(
          "hex",
        ),
      },
      body: other,
    });
    expect(put.status).toBe(409);
    expect(((await put.json()) as { error: { code: string } }).error.code).toBe("immutable");
    // The very setup publish-init sent, again: an idempotent no-op that changes nothing.
    const genesisSizes = Object.fromEntries(
      await Promise.all(
        CIRCUIT_ORDER.map(async (c) => [
          c,
          (await stat(join(stack.operator, "genesis", `${c}.genesis.zkey`))).size,
        ]),
      ),
    );
    const again = await admin(ADMIN_PATHS.configure, {
      announcement: await operatorText("ceremony.json"),
      init: await operatorText("genesis/init.json"),
      genesisSizes,
    });
    expect(again.status).toBe(200);
    expect(await phase()).toBe("OPEN");
  });

  it("F8: only the operator changes the state; a paused queue grants no slot", async () => {
    expect((await admin(ADMIN_PATHS.state, { action: "pause" }, false)).status).toBe(403);
    expect(await phase()).toBe("OPEN");
    expect((await admin(ADMIN_PATHS.state, { action: "pause" })).status).toBe(200);
    expect(await phase()).toBe("PAUSED");
    const c = person(401);
    await c.link();
    await c.call("POST", "/api/queue/join");
    expect(await c.call("GET", "/api/queue/me")).toMatchObject({ position: 1, slot: null });
    const again = await admin(ADMIN_PATHS.state, { action: "pause" });
    expect(again.status).toBe(409);
    expect((await admin(ADMIN_PATHS.state, { action: "resume" })).status).toBe(200);
    expect(await phase()).toBe("OPEN");
    // Resuming grants the waiting contributor its slot; it ends the session unused.
    expect((await c.call("GET", "/api/queue/me")).slot).not.toBeNull();
    await c.call("POST", "/api/session/claim");
    await c.finish();
    expect(await accepted()).toHaveLength(0);
  });

  it("F2: a link needs a fresh issued nonce and its own GitHub identity", async () => {
    const c = person(301);
    const payload = await c.linkPayload();
    expect((await c.sendLink(payload)).status).toBeLessThan(300);
    const linked = await c.call("GET", "/api/link");
    // The same signed link again (a replay), a nonce never issued, another GitHub id.
    expect((await c.sendLink(payload)).status).toBeGreaterThanOrEqual(400);
    const other = person(302);
    const unissued = await other.sendLink(await other.linkPayload({ nonce: "ab".repeat(32) }));
    expect(unissued.status).toBeGreaterThanOrEqual(400);
    expect(unissued.body.error.code).toBe("nonce-invalid");
    const foreign = await other.sendLink(await other.linkPayload({ github_id: 999 }));
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe("wrong-identity");
    expect(await c.call("GET", "/api/link")).toEqual(linked);
    expect((await other.call("GET", "/api/link")).linked).toBeFalsy();
  });

  it("F3: one slot at a time, one queue entry per contributor", async () => {
    const [a, b] = [person(301), person(303)];
    await b.link();
    session();
    await a.start();
    try {
      expect((await a.request("POST", "/api/queue/join")).status).toBe(409);
      await b.call("POST", "/api/queue/join");
      expect((await b.call("GET", "/api/queue/me")).slot).toBeNull();
      expect((await b.request("POST", "/api/session/claim")).status).toBe(409);
      expect((await b.request("POST", "/api/queue/join")).body.error?.code).toBe("already-queued");
      // b leaves before the slot frees up, so the next sessions find an empty queue.
      await b.call("POST", "/api/queue/leave");
      await a.finish();
    } finally {
      a.end();
    }
    expect(await accepted()).toHaveLength(0);
  });

  it("accepts three contributors in turn, one through the CLI path; F4, F5 and F7 attacks fail", async () => {
    let cli: (string | number)[][] = [];
    for (const [i, method] of (["browser", "browser", "cli"] as const).entries()) {
      const c = person(101 + i, method);
      // oxlint-disable-next-line no-await-in-loop -- sessions are sequential by design
      await c.link();
      session();
      if (method === "cli") {
        // The CLI path (SPEC §4.4): join and mint the token in the browser, then the real
        // `contribute` command drives the whole session with that token alone.
        // oxlint-disable-next-line no-await-in-loop -- sessions are sequential by design
        await c.call("POST", "/api/queue/join");
        // oxlint-disable-next-line no-await-in-loop -- sessions are sequential by design
        const { token } = await c.call("POST", CONTRIBUTOR_PATHS.cliToken);
        // oxlint-disable-next-line no-await-in-loop -- sessions are sequential by design
        const summary = await runContribute(
          {
            coordinator: base,
            announcementSha256: stack.announcementSha256,
            token: token as string,
            work: stack.work,
            client: { name: "orbinum-ceremony-cli", version: "0.0.0", commit: "0e2e0e2" },
          },
          () => undefined,
        );
        cli = summary.contributions.map((x) => [x.circuit, x.index]);
        // It ends unattested and attests after finalization, which must refuse it.
        sessions.late = summary.seq;
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- sessions are sequential by design
      const seq = await c.start();
      try {
        if (i === 0) {
          // oxlint-disable-next-line no-await-in-loop -- the attacks happen inside the session
          await uploadAttacks(c);
        }
        for (const circuit of CIRCUIT_ORDER) {
          // oxlint-disable-next-line no-await-in-loop -- circuits go in order (SPEC §4.1)
          expect(await c.contributeTo(circuit)).toMatchObject({ status: "valid", index: i + 1 });
        }
        if (i === 0) {
          sessions.first = seq;
          // oxlint-disable-next-line no-await-in-loop -- the attacks happen inside the session
          await attestationAttacks(c, seq);
        }
        // oxlint-disable-next-line no-await-in-loop -- sessions are sequential by design
        await c.attest(seq, await accepted());
      } finally {
        c.end();
      }
    }

    expect(cli).toEqual(CIRCUIT_ORDER.map((circuit) => [circuit, 3]));
    const t = await records();
    expect(verifyChain(t.records, t.chainGenesis).ok).toBe(true);
    const contributions = await accepted();
    expect(contributions).toHaveLength(9);
    expect(contributions.filter((r) => r.method === "cli")).toHaveLength(3);
    expect(t.records.filter((r) => r.type === "attestation")).toHaveLength(2);
  });

  /** F4 (upload) and F5 (verifier reports): nothing they send changes the transcript. */
  async function uploadAttacks(c: Contributor) {
    const before = (await records()).records.length;
    const outsider = person(303);
    const shield = await c.contribution("shield");
    expect((await outsider.upload("shield", shield.output, shield.claim)).status).toBe(409);
    const early = await c.upload("unshield", shield.output, shield.claim);
    expect(early.status).toBe(409);
    const lying = await c.contribution("shield", { wrongOutputHash: true });
    expect((await c.upload("shield", lying.output, lying.claim)).status).toBeGreaterThanOrEqual(
      400,
    );
    const forged = JSON.stringify({
      job: { seq: 1, circuit: "shield", attempt: 1 },
      result: "valid",
    });
    const url = new URL(`${base}/internal/verifications`);
    for (const init of [
      signedRequestInit(
        "a-wrong-key-of-at-least-32-bytes!",
        stack.ceremonyId,
        "POST",
        url,
        forged,
        Date.now(),
      ),
      signedRequestInit(stack.hmacKey, stack.ceremonyId, "POST", url, forged, Date.now() - 600_000),
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- two forged reports
      expect((await fetch(url, init)).status).toBe(401);
    }
    expect((await records()).records).toHaveLength(before);
  }

  /** F7: an attestation by another wallet, or over other records, is refused. */
  async function attestationAttacks(c: Contributor, seq: number) {
    const before = (await records()).records.length;
    const honest = c.attestation(seq, await accepted());
    const stranger = await c.sendAttestation(honest, Wallet.createRandom());
    expect(stranger.status).toBe(401);
    const other = structuredClone(honest);
    (other.contributions[0] as { contribution_hash: string }).contribution_hash = "ab".repeat(64);
    const mismatch = await c.sendAttestation(other);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe("attestation-mismatch");
    expect((await records()).records).toHaveLength(before);
  }

  it("F6: rejects a manipulated upload through the real verifier; head and slot move on", async () => {
    const c = person(201);
    await c.link();
    session();
    await c.start();
    try {
      expect(await c.contributeTo("shield", { flip: true })).toMatchObject({
        status: "rejected",
        reason: "zkey-verify-failed",
      });
      await c.finish();
    } finally {
      c.end();
    }
    expect(await accepted()).toHaveLength(9);
    expect((await fetch(`${base}/artifacts/contributions/shield/4.zkey`)).status).toBe(404);
    expect((await c.call("GET", "/api/queue/me")).slot).toBeNull();
    expect(
      Math.max(...(await accepted()).filter((r) => r.circuit === "shield").map((r) => r.index)),
    ).toBe(3);
  });

  it("F12: public reads expose no identity; receipts and artifacts are bounded", async () => {
    const status = await (await fetch(`${base}/api/status`)).text();
    for (const c of people.values()) {
      expect(status.toLowerCase()).not.toContain(c.wallet.address.toLowerCase());
      expect(status).not.toContain(`user-${c.githubId}`);
    }
    const seq = sessions.first as number;
    const receipt = (await (await fetch(`${base}/api/receipt/${seq}`)).json()) as {
      seq: number;
      records: Chained[];
    };
    expect(receipt.seq).toBe(seq);
    expect(receipt.records.map((r) => r.type)).toEqual([
      "contribution",
      "contribution",
      "contribution",
      "attestation",
    ]);
    for (const key of ["contributions/shield/99.zkey", "..%2F..%2Fwrangler.jsonc", "%2e%2e/x"]) {
      // oxlint-disable-next-line no-await-in-loop -- a few keys
      expect((await fetch(`${base}/artifacts/${key}`)).status).toBe(404);
    }
  });

  it("publishes final heads that stock snarkjs verifies against the genesis", async () => {
    for (const circuit of CIRCUIT_ORDER) {
      const path = join(stack.work, `${circuit}-head.zkey`);
      // oxlint-disable-next-line no-await-in-loop -- one 17 MB download and check at a time
      const response = await fetch(`${base}/artifacts/contributions/${circuit}/3.zkey`);
      // oxlint-disable-next-line no-await-in-loop -- one 17 MB download and check at a time
      await writeFile(path, new Uint8Array(await response.arrayBuffer()));
      const genesis = join(CEREMONY_DIR as string, "genesis", `${circuit}.genesis.zkey`);
      // oxlint-disable-next-line no-await-in-loop -- one check at a time
      expect((await verifyFromInit(genesis, ptau, path)).ok).toBe(true);
    }
  });

  it("F10/F11: refuses to finalize before close, and a tampered mirror, sealing nothing", async () => {
    const mirror = join(stack.work, "early");
    const download = (from: string, dir = mirror) =>
      runDownload({
        from,
        dir,
        announcementSha256: stack.announcementSha256,
        withPtau: false,
        force: false,
      });
    await download(`${base}/artifacts`);
    await expect(runFinalize({ dir: mirror, ptau }, () => new Date())).rejects.toThrow(
      /contributions are open until/,
    );
    const { records: local } = JSON.parse(
      await readFile(join(mirror, "transcript.json"), "utf8"),
    ) as Transcript;
    expect(local.some((r) => r.type === "beacon")).toBe(false);

    // A mirror in front of the coordinator that substitutes a contribution.
    const proxy = createServer((req, res) => {
      void (async () => {
        const upstream = await fetch(`${base}/artifacts${req.url ?? "/"}`);
        const body = new Uint8Array(await upstream.arrayBuffer());
        if (req.url === "/contributions/shield/2.zkey") body[0] = (body[0] ?? 0) ^ 1;
        res.writeHead(upstream.status).end(body);
      })();
    });
    await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
    try {
      const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
      await expect(download(url, join(stack.work, "tampered"))).rejects.toThrow(
        "contributions/shield/2.zkey: does not match its pinned hash",
      );
    } finally {
      await new Promise((r) => proxy.close(r));
    }
  });

  it.runIf(LIVE_DRAND)(
    "F9/F10: finalizes, hands the finalization over, and verifies what was published again",
    async () => {
      // Contributions close, then the announced drand round is emitted.
      const ready = Math.max(
        Date.parse(stack.announcement.schedule.close),
        roundTime(stack.announcement.beacon.round) * 1000,
      );
      await new Promise((r) => setTimeout(r, Math.max(0, ready - Date.now()) + 5000));

      const mirror = join(stack.work, "mirror");
      const download = () =>
        runDownload({
          from: `${base}/artifacts`,
          dir: mirror,
          announcementSha256: stack.announcementSha256,
          withPtau: false,
          force: false,
        });
      await download();
      const finals = await runFinalize({ dir: mirror, ptau });
      expect(finals.map((f) => f.contributions)).toEqual([3, 3, 3]);

      const sealed = await runPublishFinal({ dir: mirror, coordinator: base });
      expect(await phase()).toBe("FINALIZED");
      // Re-running it changes nothing.
      expect(await runPublishFinal({ dir: mirror, coordinator: base })).toBe(sealed);

      // What anyone downloads now carries the beacon and the finals, and verifies.
      await download();
      const published = (await (
        await fetch(`${base}/artifacts/transcript.json`)
      ).json()) as Transcript;
      expect(published.records.at(-1)?.chain).toBe(sealed);
      expect(published.finals.map((f) => f.circuit)).toEqual(["shield", "unshield", "transfer"]);
      const report = await runVerify(verifyOptions(mirror));
      expect(report.checks.filter((c) => c.status === "fail")).toEqual([]);

      // FINALIZED is read-only: even a valid attestation of a real session is refused.
      const late = person(103, "cli");
      const before = (await records()).records.length;
      const answer = await late.sendAttestation(
        late.attestation(sessions.late as number, await accepted()),
      );
      expect(answer.status).toBe(409);
      expect(answer.body.error.code).toBe("finalized");
      expect((await records()).records).toHaveLength(before);
    },
  );
});
