/**
 * `publish-final` options: the finalized ceremony directory and the coordinator's origin to hand it
 * to (its `/admin/*` routes are behind Cloudflare Access).
 */

export interface PublishFinalOptions {
  dir: string;
  coordinator: string;
}
