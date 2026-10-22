/** Transcript integrity and completeness, exactly as core checks them. SPEC §2.6, §5, §6. */
import { type BeaconRecord, checkTranscript } from "@orbinum-ceremony/core";
import type { VerifyContext } from "../context";

/** Reports every transcript check; returns the sealed beacon, if there is one. */
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
