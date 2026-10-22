/** The operator API the cli calls on the coordinator (behind Cloudflare Access). COORDINATOR §3. */

/**
 * Header carrying the SHA-256 of an uploaded setup or final file; the bucket checks the bytes
 * against it.
 */
export const CONTENT_SHA256_HEADER = "x-content-sha256";

/** Paths of the operator API. */
export const ADMIN_PATHS = {
  /**
   * `PUT`: one setup file (`isSetupFileKey`) before configuring, or one final file
   * (`isFinalFileKey`, with the hash its final record pins) before finalizing; immutable once
   * published.
   */
  artifact: (key: string) => `/admin/artifacts/${key}`,
  /** `POST`: freezes the setup (ceremony.json, init.json, genesis sizes). */
  configure: "/admin/configure",
  /** `POST`: one operator state action (`OPERATOR_ACTIONS`). */
  state: "/admin/state",
  /** `POST`: lifts an identity's hold after repeated `infra` releases (`{ githubId }`). */
  unhold: "/admin/unhold",
  /** `POST`: seals the ceremony with its beacon and finals (`FinalizeRequest`); read-only after. */
  finalize: "/admin/finalize",
} as const;
