/** Reports transcript integrity and completeness exactly as core checks them; returns the sealed beacon, if any. */
import { type BeaconRecord, checkTranscript } from "@orbinum-ceremony/core";
import type { VerifyContext } from "../types";

export function reportTranscript(ctx: VerifyContext): BeaconRecord | undefined {
  const { transcript, announcement, init } = ctx;
  const { checks, beacon } = checkTranscript(
    transcript,
    announcement.value,
    announcement.sha256,
    init.value,
  );
  for (const c of checks) ctx.report.expect(c.id, c.problems, c.detail);
  return beacon;
}
