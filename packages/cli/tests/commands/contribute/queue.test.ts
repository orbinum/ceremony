/**
 * `contribute` against a coordinator that runs the queue's real state machine (core `step`,
 * `slotView`, `jobResultView`), with the verifier's verdicts scripted: the client loop must follow
 * the queue's own rules (retry after a rejection, skip after two, wait out `infra`, `stale` and an
 * operator pause), recognise its own upload when the answer is lost even after earlier sessions,
 * never claim an upload that is not its own, and give its turn or place back when it stops.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  apiErrorStatus,
  CEREMONY_LAYOUT,
  type CircuitName,
  initialQueue,
  type Job,
  jobResultView,
  type QueueEvent,
  type QueueState,
  sha256Hex,
  slotView,
  step,
} from "@orbinum-ceremony/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { runContribute } from "../../../src/api";
import {
  json,
  localServer,
  PTAU_PATH,
  rejection,
  shieldOnlyCeremony,
  type TestCeremony,
} from "../../support";

const ID = 501;
const CLIENT = { name: "orbinum-ceremony-cli", version: "0.0.0", commit: "0e2e0e2" };
const tokenFor = (life: number) =>
  `${Buffer.from(JSON.stringify({ gid: ID, login: "user-501", exp: Date.now() + life })).toString("base64url")}.${"0".repeat(64)}`;
const quiet = () => undefined;
/** A refusal as the Worker answers it: core's code and its status. */
const refuse = (res: Parameters<typeof json>[0], code: string) =>
  json(res, apiErrorStatus(code as never), { error: { code } });

/** The verifier's verdicts, in order, one per upload (then `valid`). */
type Outcome = "valid" | "rejected" | "infra" | "stale" | "ambiguous";

interface Script {
  verdicts?: Outcome[];
  /** The operator pauses as the first upload arrives, and resumes a moment later. */
  pauseAtUpload?: boolean;
  /** The first upload lands but its answer is lost. */
  dropUploadAnswer?: boolean;
  /** This identity's jobs of an earlier session (seq 1) for shield. */
  earlierSession?: boolean;
  /** Another upload of this identity (its browser) is already in verification. */
  foreignUpload?: boolean;
  /** Never grants the slot (keeps the identity waiting in line). */
  neverGrant?: boolean;
}

let ceremony: TestCeremony;
let genesis: Uint8Array;
let servers: Awaited<ReturnType<typeof localServer>>[] = [];

beforeAll(async () => {
  if (!PTAU_PATH) return;
  ceremony = await shieldOnlyCeremony(PTAU_PATH);
  genesis = new Uint8Array(await readFile(join(ceremony.dir, CEREMONY_LAYOUT.zkey("shield", 0))));
}, 120_000);

afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  servers = [];
});

/** A coordinator holding one identity in line behind nobody, contributing to shield only. */
async function coordinator(script: Script = {}) {
  const file = (key: string) => readFile(join(ceremony.dir, key));
  const verdicts = [...(script.verdicts ?? [])];
  let state: QueueState = step(
    initialQueue({ openAt: Date.now() - 1000, closeAt: Date.now() + 86_400_000 }),
    { type: "tick" },
    Date.now(),
  ).state;
  // Only shield is left for this identity (the ceremony has no other circuit).
  state.identities[String(ID)] = {
    noShows: 0,
    cooldownUntil: 0,
    rejected: 0,
    banned: false,
    infraResults: 0,
    held: false,
    accepted: ["unshield", "transfer"],
  };
  // An earlier session took seq 1..3: this one's first job is attempt 1 again.
  if (script.earlierSession) state.nextSeq = 4;
  const jobs: Job[] = script.earlierSession
    ? [
        {
          seq: 1,
          circuit: "shield",
          attempt: 1,
          index: 1,
          githubId: ID,
          key: "k",
          size: 1,
          claim: {
            inputSha256: "00".repeat(32),
            outputSha256: "11".repeat(32),
            contributionHash: "22".repeat(64),
            method: "cli",
            client: CLIENT,
          },
          status: "done",
          outcome: "rejected",
          report: null,
        },
      ]
    : [];
  const releases: string[] = [];
  let left = false;
  let dropped = false;
  let paused = false;
  const apply = (event: QueueEvent) => {
    const r = step(state, event, Date.now());
    if (!r.ok) return r.refusal;
    state = r.state;
    for (const e of r.effects) if (e.type === "release") releases.push(e.reason);
    return null;
  };
  if (!script.neverGrant) apply({ type: "join", githubId: ID });
  else {
    // A queued identity behind another that holds the slot.
    apply({ type: "join", githubId: 999 });
    apply({ type: "join", githubId: ID });
  }
  const latest = (c: CircuitName) =>
    jobs
      .filter((j) => j.circuit === c)
      .toSorted((a, b) => b.seq - a.seq || b.attempt - a.attempt)[0];
  const holder =
    (type: "claim" | "heartbeat" | "finish" | "leave") =>
    (_q: unknown, res: Parameters<typeof json>[0]) => {
      if (type === "leave") left = true;
      const refusal = apply({ type, githubId: ID });
      return refusal ? refuse(res, refusal) : json(res, 200, { ok: true });
    };

  const server = await localServer({
    "/artifacts/ceremony.json": (_q, res) =>
      void file(CEREMONY_LAYOUT.announcement).then((b) => res.end(b)),
    "/artifacts/genesis/init.json": (_q, res) =>
      void file(CEREMONY_LAYOUT.init).then((b) => res.end(b)),
    "/artifacts/genesis/shield.genesis.zkey": (_q, res) => res.end(genesis),
    "/api/queue/me": (_q, res) => json(res, 200, slotView(state, ID)),
    "/api/queue/leave": holder("leave"),
    "/api/session/claim": holder("claim"),
    "/api/session/heartbeat": holder("heartbeat"),
    "/api/session/finish": holder("finish"),
    "/api/session/head/shield": (_q, res) =>
      json(res, 200, {
        index: 0,
        output_sha256: sha256Hex(genesis),
        url: "/artifacts/genesis/shield.genesis.zkey",
      }),
    "/api/session/upload/shield": (req, res) => {
      if (script.pauseAtUpload && !paused) {
        paused = true;
        apply({ type: "pause" });
        setTimeout(() => apply({ type: "resume" }), 1500);
      }
      if (script.foreignUpload && !jobs.some((j) => j.claim.client.name === "browser")) {
        apply({ type: "uploaded", githubId: ID, circuit: "shield" });
        jobs.push({
          seq: state.slot?.seq ?? 0,
          circuit: "shield",
          attempt: 1,
          index: 1,
          githubId: ID,
          key: "b",
          size: 1,
          claim: {
            inputSha256: sha256Hex(genesis),
            outputSha256: "33".repeat(32),
            contributionHash: "44".repeat(64),
            method: "browser",
            client: { name: "browser", version: "1", commit: "abcdef0" },
          },
          status: "pending",
          outcome: null,
          report: null,
        });
        // The browser's upload settles a moment later.
        const seq = state.slot?.seq ?? 0;
        setTimeout(() => {
          apply({ type: "verified", seq, circuit: "shield", attempt: 1, outcome: "valid" });
          const j = jobs.find((x) => x.claim.client.name === "browser");
          if (j) Object.assign(j, { status: "done", outcome: "valid" });
        }, 2000);
      }
      const refusal = apply({ type: "uploaded", githubId: ID, circuit: "shield" });
      if (refusal) return refuse(res, refusal);
      const entry = state.slot?.circuits.find((c) => c.circuit === "shield");
      jobs.push({
        seq: state.slot?.seq ?? 0,
        circuit: "shield",
        attempt: entry?.uploads ?? 0,
        index: 1,
        githubId: ID,
        key: "x",
        size: 1,
        claim: JSON.parse(String(req.headers["x-ceremony-claim"])),
        status: "pending",
        outcome: null,
        report: null,
      });
      if (script.dropUploadAnswer && !dropped) {
        dropped = true;
        return void res.socket?.destroy();
      }
      json(res, 202, { ok: true });
    },
    "/api/session/result/shield": (_q, res) => {
      const job = latest("shield");
      if (!job) return refuse(res, "unknown-job");
      if (job.status === "pending" && job.claim.client.name !== "browser") {
        const outcome = verdicts.shift() ?? "valid";
        if (outcome === "stale") {
          // The verify deadline passed: the queue takes it as infra, the job goes stale.
          apply({
            type: "verified",
            seq: job.seq,
            circuit: "shield",
            attempt: job.attempt,
            outcome: "infra",
          });
          job.status = "stale";
        } else {
          apply({
            type: "verified",
            seq: job.seq,
            circuit: "shield",
            attempt: job.attempt,
            outcome,
          });
          job.status = "done";
          job.outcome = outcome;
        }
        if (state.phase === "PAUSED") setTimeout(() => apply({ type: "resume" }), 1000);
      }
      json(res, 200, jobResultView(job));
    },
  });
  servers.push(server);
  return {
    options: {
      coordinator: server.url,
      announcementSha256: ceremony.announcementSha256,
      token: tokenFor(3_600_000),
      client: CLIENT,
    },
    state: () => state,
    releases,
    left: () => left,
    uploads: () => server.requests.filter((r) => r.path === "/api/session/upload/shield").length,
  };
}

describe.skipIf(!PTAU_PATH)(
  "contribute against the queue's own rules",
  { timeout: 180_000 },
  () => {
    it("retries after a rejection and is accepted", async () => {
      const c = await coordinator({ verdicts: ["rejected", "valid"] });
      const s = await runContribute(c.options, quiet);
      expect(s.contributions).toMatchObject([{ circuit: "shield" }]);
      expect(c.uploads()).toBe(2);
    });

    it("stops after two rejections (the circuit skipped), ending the session", async () => {
      const c = await coordinator({ verdicts: ["rejected", "rejected"] });
      expect((await rejection(runContribute(c.options, quiet))).message).toMatch(/no contribution/);
      expect(c.uploads()).toBe(2);
      expect(c.state().slot).toBeNull();
      expect(c.releases).toEqual(["finished"]);
    });

    it("waits out infra and stale (paused, then resumed) and is accepted", async () => {
      for (const first of ["infra", "stale"] as const) {
        // oxlint-disable-next-line no-await-in-loop -- one script at a time
        const c = await coordinator({ verdicts: [first, "valid"] });
        // oxlint-disable-next-line no-await-in-loop -- one script at a time
        const s = await runContribute(c.options, quiet);
        expect([first, s.contributions.length]).toEqual([first, 1]);
      }
    });

    it("waits out an operator pause that refused its upload", async () => {
      const c = await coordinator({ pauseAtUpload: true });
      const s = await runContribute(c.options, quiet);
      expect(s.contributions).toHaveLength(1);
      expect(c.uploads()).toBe(2);
    });

    it("recognises its own landed upload after an earlier session's jobs", async () => {
      const c = await coordinator({ earlierSession: true, dropUploadAnswer: true });
      const s = await runContribute(c.options, quiet);
      expect(s).toMatchObject({ seq: 4, contributions: [{ circuit: "shield" }] });
      expect(c.uploads()).toBe(1);
    });

    it("never claims an upload that is not its own", async () => {
      const c = await coordinator({ foreignUpload: true });
      const lines: string[] = [];
      await rejection(runContribute(c.options, (l) => lines.push(l)));
      expect(lines.some((l) => l.includes("accepted"))).toBe(false);
    });

    it("gives its place back when interrupted while waiting", async () => {
      const c = await coordinator({ neverGrant: true });
      const abort = new AbortController();
      const run = runContribute(
        c.options,
        (l) => l.startsWith("waiting") && abort.abort(),
        abort.signal,
      );
      await rejection(run);
      expect(c.left()).toBe(true);
      expect(c.state().queue.some((e) => e.githubId === ID)).toBe(false);
    });

    it("refuses to start with a token too short-lived to finish a session", async () => {
      const c = await coordinator({ neverGrant: true });
      const error = await rejection(
        runContribute({ ...c.options, token: tokenFor(29 * 60_000) }, quiet),
      );
      expect(error.message).toMatch(/expires within/);
      expect(c.left()).toBe(false);
    });
  },
);
