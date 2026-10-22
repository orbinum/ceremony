/**
 * The whole stack for one ceremony: `wrangler dev` (coordinator, local R2 and Durable Object), the
 * verifier service, and an operator directory with the rehearsal's frozen inputs. The schedule is
 * announced only once both services answer, so the contribution window is not spent starting them.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPublishInit } from "@orbinum-ceremony/cli";
import {
  buildAnnouncement,
  type CeremonyAnnouncement,
  CIRCUITS_REPO_URL,
  parseInit,
  serializeJson,
  sha256Utf8,
} from "@orbinum-ceremony/core";
import { freePorts, type Service, startCoordinator, startVerifier } from "./processes";

const HMAC_KEY = "e2e-verifier-key-of-at-least-32-bytes";

/** A running stack with its ceremony published and open. */
export interface Stack {
  work: string;
  /** The operator's directory: frozen inputs and the announcement. */
  operator: string;
  coordinator: Service;
  verifier: Service;
  ceremonyId: string;
  announcement: CeremonyAnnouncement;
  announcementSha256: string;
  /** The verifier's HMAC key, for forged reports. */
  hmacKey: string;
  /** Milliseconds left before the announced close. */
  remaining(): number;
  stop(): Promise<void>;
}

/**
 * Starts the stack on the rehearsal in `source` and publishes a local ceremony that closes
 * `openForMs` after the services are up, its beacon `beaconDelaySeconds` later.
 */
export async function startStack(
  source: string,
  ptau: string,
  openForMs: number,
  beaconDelaySeconds = 1,
): Promise<Stack> {
  const work = await mkdtemp(join(tmpdir(), "orbinum-e2e-ceremony-"));
  const services: Service[] = [];
  const stop = async () => {
    await Promise.all(services.map((s) => s.stop()));
    await rm(work, { recursive: true, force: true });
  };
  try {
    const initText = await readFile(join(source, "genesis", "init.json"), "utf8");
    const init = parseInit(initText);
    const ceremonyId = init.ceremony_id;

    // The operator's directory: the rehearsal's frozen inputs under a fresh announcement.
    const operator = join(work, "operator");
    await mkdir(join(operator, "genesis"), { recursive: true });
    await cp(join(source, "r1cs"), join(operator, "r1cs"), { recursive: true });
    await writeFile(join(operator, "genesis", "init.json"), initText);
    for (const c of init.circuits) {
      const name = `${c.name}.genesis.zkey`;
      // oxlint-disable-next-line no-await-in-loop -- three copies
      await cp(join(source, "genesis", name), join(operator, "genesis", name));
    }

    const [coordinatorPort, verifierPort] = await freePorts(2);
    const envFile = join(work, ".dev.vars");
    await writeFile(
      envFile,
      [
        "SESSION_KEY=e2e-session-key-of-at-least-32-bytes",
        "GITHUB_CLIENT_SECRET=unused",
        `VERIFIER_HMAC_KEY=${HMAC_KEY}`,
        "TURNSTILE_SECRET=unused",
        "",
      ].join("\n"),
    );
    const coordinator = await startCoordinator({
      port: coordinatorPort as number,
      persist: join(work, "state"),
      envFile,
      vars: {
        CEREMONY_ID: ceremonyId,
        ENVIRONMENT: "local",
        // The test reads the transcript right after each change: no edge cache.
        PUBLIC_CACHE_SECONDS: "0",
        VERIFIER_URL: `http://127.0.0.1:${verifierPort}`,
      },
    });
    services.push(coordinator);
    await mkdir(join(work, "logs"));
    // The verifier service as its own process, configured as on the VPS.
    const verifier = await startVerifier({
      COORDINATOR_URL: coordinator.url,
      VERIFIER_HMAC_KEY: HMAC_KEY,
      CEREMONY_DIR: operator,
      PTAU: ptau,
      LOG_DIR: join(work, "logs"),
      PORT: String(verifierPort),
    });
    services.push(verifier);

    // Both services answer: only now is the window announced.
    const close = Date.now() + openForMs;
    const announcement = buildAnnouncement({
      ceremonyId,
      network: "local",
      initSha256: sha256Utf8(initText),
      circuitsSource: {
        repo: CIRCUITS_REPO_URL,
        tag: init.source.ref,
        commit: init.source.commit,
      },
      minContributions: 3,
      open: new Date(Date.now() - 1000),
      close: new Date(close),
      beaconDelaySeconds,
    });
    await writeFile(join(operator, "ceremony.json"), serializeJson(announcement));

    // The operator publishes the setup through the coordinator, as before a real opening. A
    // local coordinator is plaintext: no Access token may be around to leak (it is never sent).
    delete process.env.CF_ACCESS_CLIENT_ID;
    delete process.env.CF_ACCESS_CLIENT_SECRET;
    const announcementSha256 = await runPublishInit({
      dir: operator,
      coordinator: coordinator.url,
      ptau,
    });
    for (let i = 0; i < 40; i++) {
      // oxlint-disable-next-line no-await-in-loop -- waits for the opening alarm
      const status = (await (await fetch(`${coordinator.url}/api/status`)).json()) as {
        phase: string;
      };
      if (status.phase === "OPEN") {
        return {
          work,
          operator,
          coordinator,
          verifier,
          ceremonyId,
          announcement,
          announcementSha256,
          hmacKey: HMAC_KEY,
          remaining: () => close - Date.now(),
          stop,
        };
      }
      // oxlint-disable-next-line no-await-in-loop -- waits for the opening alarm
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("the ceremony did not open");
  } catch (error) {
    await stop();
    throw error;
  }
}
