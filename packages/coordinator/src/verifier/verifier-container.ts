/**
 * The verifier as a Cloudflare Container, one per ceremony, driven by this Durable Object. A
 * claimed turn warms it, so its first upload does not wait for the start. A dispatched job is kept
 * here and handed over from an alarm: the alarm starts the container when it is not running (it
 * mirrors the published inputs and checks their pins, about a minute), waits until `/healthz`
 * answers, then posts every job still worth running, in order, signed as any dispatch. Each job is
 * kept until its deadline: one posted to a container that has since stopped or been replaced (a
 * crash, a deploy) is posted again to the new one, which runs it from the start, and the
 * coordinator takes a second report as a duplicate. Each start is numbered, since a new process has
 * an empty job queue. A container on an older image is replaced, so the coordinator and the
 * verifier run the same version. A job past its deadline is dropped without a start; a refusal from
 * the verifier is its answer, not a fault to retry. The container reports to the coordinator's
 * public `/internal` routes. A failed alarm is retried by the platform, and a container that never
 * becomes healthy (pins failed, or wedged) is destroyed so that retry starts afresh.
 */
import { DurableObject } from "cloudflare:workers";
import { type JobSpec, jobKey } from "@orbinum-ceremony/core";
import { ceremony } from "../durable";
import { postJob } from "../services";
import { BOOT_MS, IDLE_MS, INSTANCE, PORT, STALE_MS, WATCH_MS } from "./constants";
import type { Queued } from "./types";

export class VerifierContainer extends DurableObject<Env> {
  async enqueue(spec: JobSpec): Promise<void> {
    const queued: Queued = { spec, at: Date.now() };
    await this.ctx.storage.put(`job:${jobKey(spec.job)}`, queued);
    await this.ctx.storage.setAlarm(Date.now());
  }

  async warm(): Promise<void> {
    await this.ctx.storage.put("warm", Date.now());
    await this.ctx.storage.setAlarm(Date.now());
  }

  override async alarm(): Promise<void> {
    const warm = await this.ctx.storage.get<number>("warm");
    if (warm !== undefined) await this.ctx.storage.delete("warm");
    const jobs = await this.ctx.storage.list<Queued>({ prefix: "job:" });
    const stale = [...jobs].filter(([, { at }]) => Date.now() - at >= STALE_MS).map(([k]) => k);
    if (stale.length > 0) await this.ctx.storage.delete(stale);
    const fresh = [...jobs].filter(([key]) => !stale.includes(key));
    if (fresh.length === 0) {
      if (warm !== undefined && Date.now() - warm < STALE_MS) await this.ready();
      return;
    }
    const { port, start } = await this.ready();
    for (const [key, queued] of fresh) {
      if (queued.postedTo === start || Date.now() - queued.at >= STALE_MS) continue;
      // oxlint-disable-next-line no-await-in-loop
      const status = await postJob(
        this.env,
        (u, i) => port.fetch(u, i),
        "http://container",
        queued.spec,
      );
      if (status !== 202) console.error(`verifier container answered ${status}`);
      // oxlint-disable-next-line no-await-in-loop
      await this.ctx.storage.put(key, { ...queued, postedTo: start });
    }
    await this.ctx.storage.setAlarm(Date.now() + WATCH_MS);
  }

  private async ready(): Promise<{ port: Fetcher; start: number }> {
    const container = this.ctx.container;
    if (!container) throw new Error("no container is configured for VerifierContainer");
    const image = container.images.verifier;
    if (!image) throw new Error("the verifier image is not configured");
    if (container.running && (await container.inspect())?.image !== image) {
      await container.destroy();
    }
    if (!container.running) {
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
        // oxlint-disable-next-line no-await-in-loop
        const health = await port.fetch("http://container/healthz", {
          signal: AbortSignal.timeout(2_000),
        });
        // oxlint-disable-next-line no-await-in-loop
        await health.body?.cancel();
        if (health.ok) return { port, start };
      } catch {}
      if (!container.running) throw new Error("the verifier container exited while starting");
      if (Date.now() > until) {
        // oxlint-disable-next-line no-await-in-loop
        await container.destroy();
        throw new Error("the verifier container did not become healthy");
      }
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((done) => setTimeout(done, 1_000));
    }
  }
}
