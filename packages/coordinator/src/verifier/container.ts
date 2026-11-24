/**
 * The verifier as a Cloudflare Container (COORDINATOR §5), one per ceremony, driven by this
 * Durable Object. A claimed turn warms it (`warm`), so its first upload does not wait for the
 * start. A dispatched job is kept here and handed over from an alarm: the alarm starts
 * the container when it is not running (it mirrors the published inputs and checks their pins,
 * about a minute), waits until `/healthz` answers, then posts every job still worth running,
 * signed as any dispatch, and keeps it until its deadline in case the container is lost. The
 * container reports to the coordinator's public `/internal` routes. A failed alarm is retried by
 * the platform; a job the coordinator has given up on is dropped.
 */
import { DurableObject } from "cloudflare:workers";
import { type JobSpec, jobKey } from "@orbinum-ceremony/core";
import { ceremony } from "../durable";
import { postJob } from "../services";

/** The port `packages/verifier/Dockerfile` listens on. */
const PORT = 8788;
/** 2 vCPU / 8 GiB: `transfer` needs ~700 MB and a few CPU-bound minutes at most. */
const INSTANCE = "standard-3";
/** Startup mirrors ~100 MB and hashes it, then runs one snarkjs task. */
const BOOT_MS = 5 * 60_000;
/** Kept warm between turns; a cold start eats into the next job's deadline. */
const IDLE_MS = 30 * 60_000;
/** Past the verify deadline, the coordinator has already counted the job as `infra`. */
const STALE_MS = 6 * 60_000;
/** While a posted job may still be running, how often the container is checked. */
const WATCH_MS = 30_000;

interface Queued {
  spec: JobSpec;
  at: number;
  /** The container start it was posted to (its jobs live in that process's memory). */
  postedTo?: number;
}

export class VerifierContainer extends DurableObject<Env> {
  /** Keeps the job and wakes the alarm; returns at once (the caller is the upload's waitUntil). */
  async enqueue(spec: JobSpec): Promise<void> {
    const queued: Queued = { spec, at: Date.now() };
    await this.ctx.storage.put(`job:${jobKey(spec.job)}`, queued);
    await this.ctx.storage.setAlarm(Date.now());
  }

  /** Starts the container ahead of a job (a turn was claimed); returns at once. */
  async warm(): Promise<void> {
    await this.ctx.storage.put("warm", Date.now());
    await this.ctx.storage.setAlarm(Date.now());
  }

  /**
   * Hands every job still worth running to the container, and keeps it until its deadline: a job
   * posted to a container that has since stopped or been replaced (a crash, a deploy) is posted
   * again to the new one, which runs it from the start. A job that already reported is posted
   * again only then, and the coordinator takes its second report as a duplicate.
   */
  override async alarm(): Promise<void> {
    const warm = await this.ctx.storage.get<number>("warm");
    if (warm !== undefined) await this.ctx.storage.delete("warm");
    const jobs = await this.ctx.storage.list<Queued>({ prefix: "job:" });
    // A job past its deadline is already `infra` on the coordinator: dropped without a start.
    const stale = [...jobs].filter(([, { at }]) => Date.now() - at >= STALE_MS).map(([k]) => k);
    if (stale.length > 0) await this.ctx.storage.delete(stale);
    const fresh = [...jobs].filter(([key]) => !stale.includes(key));
    // Warmed for a claimed turn: started now, kept for the idle timeout.
    if (fresh.length === 0) {
      if (warm !== undefined && Date.now() - warm < STALE_MS) await this.ready();
      return;
    }
    const { port, start } = await this.ready();
    for (const [key, queued] of fresh) {
      // A start can take minutes: a job that went stale meanwhile is not posted either.
      if (queued.postedTo === start || Date.now() - queued.at >= STALE_MS) continue;
      // oxlint-disable-next-line no-await-in-loop -- jobs go in order
      const status = await postJob(
        this.env,
        (u, i) => port.fetch(u, i),
        "http://container",
        queued.spec,
      );
      // A refusal is the verifier's answer, not a fault to retry.
      if (status !== 202) console.error(`verifier container answered ${status}`);
      // oxlint-disable-next-line no-await-in-loop
      await this.ctx.storage.put(key, { ...queued, postedTo: start });
    }
    // Watched until every job's deadline: a container lost meanwhile gets them again.
    await this.ctx.storage.setAlarm(Date.now() + WATCH_MS);
  }

  /**
   * The running container on the current image, answering `/healthz`, and which start it is (a
   * new one each time this object starts it).
   */
  private async ready(): Promise<{ port: Fetcher; start: number }> {
    const container = this.ctx.container;
    if (!container) throw new Error("no container is configured for VerifierContainer");
    const image = container.images.verifier;
    if (!image) throw new Error("the verifier image is not configured");
    // A deploy brings a new image: a container still on the old one is replaced (the coordinator
    // and the verifier must run the same version); its jobs are posted to the new one.
    if (container.running && (await container.inspect())?.image !== image) {
      await container.destroy();
    }
    if (!container.running) {
      // Each start is a new process with an empty job queue: numbered, so its jobs are known.
      await this.ctx.storage.put("start", ((await this.ctx.storage.get<number>("start")) ?? 0) + 1);
      const setup = await ceremony(this.env).setup();
      if (!setup) throw new Error("no ceremony is configured");
      container.start({
        image,
        instance: INSTANCE,
        enableInternet: true,
        env: {
          COORDINATOR_URL: this.env.COORDINATOR_URL,
          VERIFIER_HMAC_KEY: this.env.VERIFIER_HMAC_KEY,
          INIT_SHA256: setup.announcement.init_sha256,
        },
      });
    }
    const start = (await this.ctx.storage.get<number>("start")) ?? 0;
    await container.setInactivityTimeout(IDLE_MS);
    const port = container.getTcpPort(PORT);
    const until = Date.now() + BOOT_MS;
    for (;;) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- polled until it answers
        const health = await port.fetch("http://container/healthz", {
          signal: AbortSignal.timeout(2_000),
        });
        // oxlint-disable-next-line no-await-in-loop
        await health.body?.cancel();
        if (health.ok) return { port, start };
      } catch {
        // Not listening yet.
      }
      if (!container.running) throw new Error("the verifier container exited while starting");
      if (Date.now() > until) {
        // Unhealthy (pins failed, or wedged): the platform's retry of this alarm starts afresh.
        // oxlint-disable-next-line no-await-in-loop -- leaves the loop by the throw below
        await container.destroy();
        throw new Error("the verifier container did not become healthy");
      }
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((done) => setTimeout(done, 1_000));
    }
  }
}
