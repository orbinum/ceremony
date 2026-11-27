/**
 * How the verifier container runs: the port its Dockerfile listens on; 2 vCPU / 8 GiB (`transfer`
 * needs ~700 MB and a few CPU-bound minutes at most); up to five minutes to boot (startup mirrors
 * ~100 MB and hashes it, then runs one snarkjs task); kept warm 30 minutes between turns, since a
 * cold start eats into the next job's deadline; a job six minutes old is past the verify deadline,
 * already `infra` on the coordinator; and while a posted job may still be running, the container is
 * checked every 30 s.
 */
export const PORT = 8788;

export const INSTANCE = "standard-3";

export const BOOT_MS = 5 * 60_000;

export const IDLE_MS = 30 * 60_000;

export const STALE_MS = 6 * 60_000;

export const WATCH_MS = 30_000;
