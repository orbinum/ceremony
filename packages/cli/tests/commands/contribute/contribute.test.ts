/**
 * `contribute` against a coordinator played by a local server: an honest session end to end
 * (real snarkjs on a real shield genesis), and a coordinator that lies, falters or is interrupted.
 * The session must always be ended, nothing it says may become a path or terminal text, and a
 * head that is not the announced circuit's, or not the end of its published chain, is never
 * contributed to.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  appendRecord,
  buildContributionRecord,
  CEREMONY_LAYOUT,
  chainGenesis,
  LOCAL_VERIFIER,
  parseAnnouncement,
  precheckUpload,
  readMpcParams,
  sha256Hex,
  genesisLayoutOf,
  TOOLING,
  type Transcript,
  transcriptOf,
} from "@orbinum-ceremony/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { runContribute } from "../../../src/api";
import {
  json,
  localServer,
  PTAU_PATH,
  rejection,
  shieldOnlyCeremony,
  T_ROUND,
  type TestCeremony,
} from "../../support";

/** A token shaped as the coordinator mints it, `life` ms from now (the CLI reads only its exp). */
const tokenFor = (life: number) =>
  `${Buffer.from(JSON.stringify({ gid: 1, login: "user-1", exp: Date.now() + life })).toString("base64url")}.${"0".repeat(64)}`;
const TOKEN = tokenFor(3_600_000);
const CLIENT = { name: "orbinum-ceremony-cli", version: "0.0.0", commit: "0e2e0e2" };
const OTHER_CIRCUIT = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "verifier",
  "tests",
  "fixtures",
  "multiplier_0.zkey",
);

/** How the fake coordinator misbehaves. */
interface Script {
  /** The slot as `/api/queue/me` shows it once granted (default: an honest one). */
  slot?: unknown;
  /** Answers before `/api/queue/me` answers at all. */
  failMe?: number;
  /** The head bytes (default: the real shield genesis). */
  head?: Uint8Array;
  /** `finish` answers `busy` this many times first. */
  busy?: number;
  /** The upload lands, but its answer is lost (the connection drops). */
  dropUploadAnswer?: boolean;
  /** `/api/queue/me` refuses the token. */
  refuseToken?: boolean;
  /** The published transcript (default: no contribution yet); null when it is not published. */
  transcript?: Transcript | null;
  /** What `/api/transcript` serves (the object's live records); none: 404. */
  live?: Transcript;
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

/** The transcript of this ceremony with `count` accepted shield contributions (random h_k). */
async function transcriptWith(count: number): Promise<Transcript> {
  const announcement = parseAnnouncement(
    await readFile(join(ceremony.dir, CEREMONY_LAYOUT.announcement), "utf8"),
  );
  const genesisChain = chainGenesis(announcement.ceremony_id, announcement);
  const records: Transcript["records"] = [];
  let input = sha256Hex(genesis);
  for (let index = 1; index <= count; index++) {
    const output = sha256Hex(Buffer.from(`output ${index}`));
    const h = sha256Hex(Buffer.from(`h ${index}`)).repeat(2);
    const record = buildContributionRecord({
      ceremonyId: announcement.ceremony_id,
      seq: index,
      circuit: "shield",
      index,
      claimed: {
        inputSha256: input,
        outputSha256: output,
        contributionHash: h,
        method: "cli",
        client: CLIENT,
      },
      verified: {
        contributionHash: h,
        zkeyName: String(index),
        deltaAfter: h,
        logSha256: output,
        verifierVersion: LOCAL_VERIFIER,
        snarkjsVersion: TOOLING.snarkjs,
      },
      contributor: null,
      at: new Date(T_ROUND - 30 * 60_000).toISOString(),
    });
    records.push(appendRecord(records, genesisChain, record));
    input = output;
  }
  return transcriptOf(announcement.ceremony_id, ceremony.announcementSha256, records);
}

/** A coordinator for one session of seq 7, contributing to shield only. */
async function coordinator(script: Script = {}) {
  const file = (key: string) => readFile(join(ceremony.dir, key));
  const head = script.head ?? genesis;
  const transcript = script.transcript === undefined ? await transcriptWith(0) : script.transcript;
  let polls = 0;
  let claimed = false;
  let accepted = false;
  let busy = script.busy ?? 0;
  let uploaded: Buffer | undefined;
  let claim: Record<string, unknown> | undefined;
  const server = await localServer({
    "/artifacts/ceremony.json": (_q, res) =>
      void file(CEREMONY_LAYOUT.announcement).then((b) => res.end(b)),
    "/artifacts/genesis/init.json": (_q, res) =>
      void file(CEREMONY_LAYOUT.init).then((b) => res.end(b)),
    "/artifacts/genesis/shield.genesis.zkey": (_q, res) => res.end(head),
    "/artifacts/transcript.json": (_q, res) =>
      transcript ? json(res, 200, transcript) : res.writeHead(404).end(),
    "/api/transcript": (_q, res) =>
      script.live ? json(res, 200, script.live) : res.writeHead(404).end(),
    "/api/queue/me": (_q, res) => {
      polls += 1;
      if (script.refuseToken) return json(res, 401, { error: { code: "unauthenticated" } });
      if (polls <= (script.failMe ?? 0)) return json(res, 503, { error: { code: "storage" } });
      if (accepted) return json(res, 200, { phase: "OPEN", position: null, slot: null });
      if (polls < 3) return json(res, 200, { phase: "OPEN", position: 1, slot: null });
      return json(res, 200, {
        phase: "OPEN",
        position: null,
        slot: script.slot ?? {
          seq: 7,
          claimed,
          claimBy: null,
          circuits: [{ circuit: "shield", status: "todo", attempts: 0 }],
        },
      });
    },
    "/api/session/claim": (_q, res) => {
      claimed = true;
      json(res, 200, { ok: true });
    },
    "/api/session/heartbeat": (_q, res) => json(res, 200, { ok: true }),
    "/api/session/head/shield": (_q, res) =>
      json(res, 200, {
        index: 0,
        output_sha256: sha256Hex(head),
        url: "/artifacts/genesis/shield.genesis.zkey",
      }),
    "/api/session/upload/shield": (req, res, body) => {
      uploaded = body;
      claim = JSON.parse(String(req.headers["x-ceremony-claim"]));
      if (script.dropUploadAnswer) return void res.socket?.destroy();
      json(res, 202, { ok: true, job: { seq: 7, circuit: "shield", attempt: 1, index: 1 } });
    },
    "/api/session/result/shield": (_q, res) => {
      if (uploaded === undefined) return json(res, 404, { error: { code: "unknown-job" } });
      accepted = true;
      json(res, 200, {
        seq: 7,
        attempt: 1,
        index: 1,
        output_sha256: sha256Hex(uploaded),
        status: "valid",
      });
    },
    "/api/session/finish": (_q, res) => {
      if (busy > 0) {
        busy -= 1;
        return json(res, 409, { error: { code: "busy", message: "verifying" } });
      }
      json(
        res,
        accepted ? 409 : 200,
        accepted ? { error: { code: "not-your-slot" } } : { ok: true },
      );
    },
  });
  servers.push(server);
  return {
    server,
    options: {
      coordinator: server.url,
      announcementSha256: ceremony.announcementSha256,
      token: TOKEN,
      client: CLIENT,
    },
    uploaded: () => uploaded,
    claim: () => claim,
    finished: () => server.requests.filter((r) => r.path === "/api/session/finish").length,
  };
}

const quiet = () => undefined;

describe.skipIf(!PTAU_PATH)("contribute against a coordinator", { timeout: 120_000 }, () => {
  it("runs an honest session: one checked contribution, uploaded as cli, the token only on the API", async () => {
    const c = await coordinator();
    const lines: string[] = [];
    const summary = await runContribute(c.options, (l) => lines.push(l));
    expect(summary).toMatchObject({ seq: 7, contributions: [{ circuit: "shield", index: 1 }] });
    // What was uploaded passes the verifier's own pre-checks and carries the claimed h_k.
    const bytes = new Uint8Array(c.uploaded() as Buffer);
    const params = readMpcParams(genesis);
    const pre = precheckUpload(
      bytes,
      c.claim() as never,
      { csHash: params.csHash, previous: [], outputSha256: sha256Hex(genesis) },
      genesisLayoutOf(genesis),
    );
    expect(pre).toMatchObject({ ok: true, index: 1, name: "7" });
    expect(c.claim()).toMatchObject({ method: "cli", client: CLIENT });
    for (const r of c.server.requests) {
      expect([r.path, r.headers.authorization]).toEqual([
        r.path,
        r.path.startsWith("/api/") ? `Bearer ${TOKEN}` : undefined,
      ]);
    }
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("rides out a coordinator that falters, and a finish refused while verifying", async () => {
    const c = await coordinator({ failMe: 2, busy: 2 });
    expect((await runContribute(c.options, quiet)).contributions).toHaveLength(1);
    expect(c.finished()).toBeGreaterThanOrEqual(3);
  });

  it("refuses a slot it cannot trust, writing nothing outside its work directory", async () => {
    for (const slot of [
      { seq: "x/../../victim", claimed: true, circuits: [{ circuit: "shield", status: "todo" }] },
      { seq: 7, claimed: true, circuits: [{ circuit: "../../outside", status: "todo" }] },
      { seq: 7, claimed: true, circuits: [{ circuit: "shield\u001b[2K", status: "todo" }] },
      { seq: 7, claimed: true, circuits: [{ circuit: "shield", status: "pwned" }] },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one coordinator at a time
      const c = await coordinator({ slot });
      // oxlint-disable-next-line no-await-in-loop -- one coordinator at a time
      await rejection(runContribute(c.options, quiet));
      expect(c.uploaded()).toBeUndefined();
    }
  });

  it("never contributes to a head that is not the announced circuit's", async () => {
    const other = new Uint8Array(await readFile(OTHER_CIRCUIT));
    const c = await coordinator({ head: other });
    const error = await rejection(runContribute(c.options, quiet));
    expect(error.message).toMatch(/not the announced circuit/);
    expect(c.uploaded()).toBeUndefined();
    expect(c.finished()).toBe(1);
  });

  it("never contributes to a head with the recorded contributions but other bytes", async () => {
    // The MPC section untouched, a point of the key changed: not the key the transcript pins.
    const head = genesis.slice();
    const at = Math.floor(head.length / 2);
    head[at] = (head[at] as number) ^ 1;
    const c = await coordinator({ head });
    const error = await rejection(runContribute(c.options, quiet));
    expect(error.message).toMatch(/shield: refusing the head, which is not the key the transcript/);
    expect(c.uploaded()).toBeUndefined();
    expect(c.finished()).toBe(1);
  });

  it("never contributes to a stale head, one the published transcript has moved past", async () => {
    const c = await coordinator({ transcript: await transcriptWith(1) });
    const error = await rejection(runContribute(c.options, quiet));
    expect(error.message).toMatch(/shield: refusing the head, which is stale: 0 contributions/);
    expect(c.uploaded()).toBeUndefined();
    expect(c.finished()).toBe(1);
  });

  it("fails closed when the published transcript is missing or does not check", async () => {
    const missing = await coordinator({ transcript: null });
    expect((await rejection(runContribute(missing.options, quiet))).message).toMatch(
      /shield: cannot check the head: GET \/artifacts\/transcript.json: HTTP 404/,
    );
    expect(missing.uploaded()).toBeUndefined();
    // Neither source checks: both reasons are named.
    expect((await rejection(runContribute(missing.options, quiet))).message).toMatch(
      /GET \/api\/transcript: HTTP 404/,
    );
    const foreign = {
      ...(await transcriptWith(0)),
      anchor: { file: "ceremony.json" as const, sha256: "00".repeat(32) },
    };
    const unanchored = await coordinator({ transcript: foreign });
    expect((await rejection(runContribute(unanchored.options, quiet))).message).toMatch(
      /cannot check the head: the published transcript fails: transcript is anchored/,
    );
    expect(unanchored.uploaded()).toBeUndefined();
    expect(unanchored.finished()).toBe(1);
  });

  it("checks the head against the live transcript when the published one is withheld or behind", async () => {
    const withheld = await coordinator({ transcript: null, live: await transcriptWith(0) });
    await runContribute(withheld.options, quiet);
    expect(withheld.uploaded()).toBeDefined();
    // Behind (published) but recorded live: the closer of the two is judged.
    const behind = await coordinator({
      transcript: await transcriptWith(1),
      live: await transcriptWith(1),
    });
    expect((await rejection(runContribute(behind.options, quiet))).message).toMatch(/is stale/);
  });

  it("refuses a coordinator whose ceremony.json is not the announced one", async () => {
    const c = await coordinator();
    const error = await rejection(
      runContribute({ ...c.options, announcementSha256: "00".repeat(32) }, quiet),
    );
    expect(error.message).toMatch(/does not match/);
    expect(c.server.requests.some((r) => r.path.startsWith("/api/"))).toBe(false);
  });

  it("ends the session when interrupted", async () => {
    const c = await coordinator();
    const abort = new AbortController();
    const run = runContribute(
      c.options,
      (line) => {
        if (line.includes("claimed")) abort.abort();
      },
      abort.signal,
    );
    expect((await rejection(run)).message).toMatch(/interrupted/);
    expect(c.uploaded()).toBeUndefined();
    expect(c.finished()).toBe(1);
  });

  it("waits for the verdict of an upload whose answer was lost", async () => {
    const c = await coordinator({ dropUploadAnswer: true });
    const summary = await runContribute(c.options, quiet);
    expect(summary.contributions).toMatchObject([{ circuit: "shield", index: 1 }]);
  });

  it("refuses to start with a token about to expire, and names a refused token", async () => {
    const c = await coordinator();
    const soon = await rejection(runContribute({ ...c.options, token: tokenFor(60_000) }, quiet));
    expect(soon.message).toMatch(/expires within/);
    expect(c.server.requests).toEqual([]);
    const refused = await coordinator({ refuseToken: true });
    expect((await rejection(runContribute(refused.options, quiet))).message).toMatch(
      /token was refused/,
    );
  });

  it("removes its private work directory, and keeps files only where asked", async () => {
    const c = await coordinator();
    const work = join(ceremony.dir, "work");
    const summary = await runContribute({ ...c.options, work }, quiet);
    const [session] = await readdir(work);
    expect(await readdir(join(work, session as string))).toEqual([
      `contributions-${summary.seq}.json`,
    ]);
  });
});
