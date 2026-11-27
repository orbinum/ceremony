/**
 * One named check of a transcript and its problems (empty: passes), with an optional detail line
 * for the report.
 */
export interface TranscriptCheck {
  id: string;
  problems: string[];
  detail?: string;
}
