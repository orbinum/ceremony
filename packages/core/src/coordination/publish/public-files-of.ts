/**
 * The files the coordinator publishes after each change: `transcript.json`, withheld with its
 * problems unless it passes core's integrity checks, and `status.json`. Each carries a version of
 * its content, so unchanged content is not written again; `now` stamps `status.json` only, not its
 * version. `finals` are the final records a sealed ceremony keeps, published with its transcript.
 */
import {
  CEREMONY_LAYOUT,
  type Chained,
  checkTranscriptIntegrity,
  contentTypeOf,
  type FinalRecord,
  type Setup,
  transcriptOf,
} from "../../ceremony";
import { serializeJson } from "../../primitives/encoding";
import { canonicalJson, sha256Utf8 } from "../../primitives/hashing";
import { type QueueState, statusOf } from "../queue";

interface PublicFile {
  key: string;
  version: string;
  contentType: string;
  body: { ok: true; text: string } | { ok: false; problems: string[] };
}

export function publicFilesOf(
  setup: Setup,
  state: QueueState,
  records: readonly Chained[],
  now: number,
  finals: readonly FinalRecord[] = [],
): PublicFile[] {
  const transcript = transcriptOf(
    setup.announcement.ceremony_id,
    setup.announcementSha256,
    [...records],
    [...finals],
  );
  const status = statusOf(setup, state, records);
  const problems = checkTranscriptIntegrity(
    transcript,
    setup.announcement,
    setup.announcementSha256,
    setup.init,
  ).flatMap((c) => c.problems.map((p) => `${c.id}: ${p}`));
  return [
    {
      key: CEREMONY_LAYOUT.transcript,
      version: sha256Utf8(canonicalJson({ head: status.head_chain, finals })),
      contentType: contentTypeOf(CEREMONY_LAYOUT.transcript),
      body:
        problems.length > 0
          ? { ok: false, problems }
          : { ok: true, text: serializeJson(transcript) },
    },
    {
      key: CEREMONY_LAYOUT.status,
      version: sha256Utf8(canonicalJson(status)),
      contentType: contentTypeOf(CEREMONY_LAYOUT.status),
      body: {
        ok: true,
        text: serializeJson({ ...status, updated_at: new Date(now).toISOString() }),
      },
    },
  ];
}
