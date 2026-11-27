/**
 * The verifier service's settings. `coordinatorUrl` is the origin of `/internal/objects` and
 * `/internal/verifications`; `hmacKey` is shared with the coordinator and authenticates both
 * directions. `host` is an IP literal or `localhost`. `ceremonyDir` is laid out by `init`
 * (`genesis/init.json`, `genesis/<c>.genesis.zkey`); `logDir` holds one record per attempt, at
 * `<logDir>/<attemptLogKey(job)>`. `timeoutMs` is the snarkjs bound per upload, within
 * `VERIFIER_TIMEOUT_MS`; `version` is the release every accepted record carries
 * (`verified_by.verifier_version`). With `initSha256`, the inputs are fetched from the
 * coordinator's public artifacts at startup and init.json must hash to it (a host with an empty
 * disk, the Cloudflare Container).
 */
export interface ServiceConfig {
  coordinatorUrl: string;
  hmacKey: string;
  host: string;
  port: number;
  ceremonyDir: string;
  ptau: string;
  logDir: string;
  timeoutMs: number;
  version: string;
  initSha256?: string;
}
