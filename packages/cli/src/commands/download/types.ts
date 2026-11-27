/**
 * Where `download` mirrors from (the public bucket's base URL) and to, and the pins everything is
 * checked from: the SHA-256 of ceremony.json from an official channel and, once the ceremony is
 * sealed, of the final transcript.json (the transcript is then refused unless it is exactly that
 * one, before any file it names). `withPtau` also fetches the 75 MB ptau mirror, checked against
 * its pinned BLAKE2b-512; `force` replaces a local transcript the new one does not extend.
 */

export interface DownloadOptions {
  from: string;
  dir: string;
  announcementSha256: string;
  transcriptSha256?: string;
  withPtau: boolean;
  force: boolean;
}
