/**
 * `publish-init` options: the ceremony directory, the coordinator's origin (its `/admin/*` routes
 * are behind Cloudflare Access) and the ptau to mirror.
 */

export interface PublishInitOptions {
  dir: string;
  coordinator: string;
  ptau: string;
}
