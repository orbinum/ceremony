/**
 * The whole stack for one ceremony: `wrangler dev` (coordinator, local R2 and Durable Object), the
 * verifier service, and an operator directory with the rehearsal's frozen inputs. The schedule is
 * announced only once both services answer, so the contribution window is not spent starting them.
 * The HMAC and session keys are fresh per process: the stack may run for hours, and a published
 * key would let any local user sign requests to it (the development identity header still lets
 * any local user act as anyone: run it on a single-user machine). The edge cache is off because
 * tests read the transcript right after each change, and Access credentials are dropped from the
 * environment because a local coordinator is plaintext.
 */
import { randomBytes } from "node:crypto";
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
import { freePorts } from "./free-ports";
import { type Service, startCoordinator, startVerifier } from "./processes";

const HMAC_KEY = randomBytes(32).toString("hex");
const SESSION_KEY = randomBytes(32).toString("hex");

export interface Stack {
  work: string;
  operator: string;
  coordinator: Service;
  verifier: Service;
  ceremonyId: string;
  announcement: CeremonyAnnouncement;
  announcementSha256: string;
  hmacKey: string;
  remaining(): number;
  stop(): Promise<void>;
}

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

    const operator = join(work, "operator");
    await mkdir(join(operator, "genesis"), { recursive: true });
    await cp(join(source, "r1cs"), join(operator, "r1cs"), { recursive: true });
    await writeFile(join(operator, "genesis", "init.json"), initText);
    for (const c of init.circuits) {
      const name = `${c.name}.genesis.zkey`;
      await cp(join(source, "genesis", name), join(operator, "genesis", name));
    }

    const [coordinatorPort, verifierPort, inspectorPort] = await freePorts(3);
    const envFile = join(work, ".dev.vars");
    await writeFile(
      envFile,
      [
        `SESSION_KEY=${SESSION_KEY}`,
        "GITHUB_CLIENT_SECRET=unused",
        `VERIFIER_HMAC_KEY=${HMAC_KEY}`,
        "TURNSTILE_SECRET=unused",
        "",
      ].join("\n"),
    );
    const coordinator = await startCoordinator({
      port: coordinatorPort as number,
      inspectorPort: inspectorPort as number,
      persist: join(work, "state"),
      envFile,
      vars: {
        CEREMONY_ID: ceremonyId,
        ENVIRONMENT: "local",
        PUBLIC_CACHE_SECONDS: "0",
        VERIFIER_URL: `http://127.0.0.1:${verifierPort}`,
      },
    });
    services.push(coordinator);
    await mkdir(join(work, "logs"));
    const verifier = await startVerifier({
      COORDINATOR_URL: coordinator.url,
      VERIFIER_HMAC_KEY: HMAC_KEY,
      CEREMONY_DIR: operator,
      PTAU: ptau,
      LOG_DIR: join(work, "logs"),
      PORT: String(verifierPort),
    });
    services.push(verifier);

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

    delete process.env.CF_ACCESS_CLIENT_ID;
    delete process.env.CF_ACCESS_CLIENT_SECRET;
    const announcementSha256 = await runPublishInit({
      dir: operator,
      coordinator: coordinator.url,
      ptau,
    });
    for (let i = 0; i < 40; i++) {
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
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("the ceremony did not open");
  } catch (error) {
    await stop();
    throw error;
  }
}
