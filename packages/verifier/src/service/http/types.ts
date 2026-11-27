/**
 * What the HTTP server deals with. A submission is queued, a retry of the same dispatch
 * (acknowledged, not run twice), another spec under an attempt already taken (refused, logged), or
 * refused by a full queue. The sink takes jobs and says whether the pins hold and the queue is
 * moving. A dispatch is authorized by the shared key and must be bound to the ceremony (init.json).
 */
import type { JobSpec } from "@orbinum-ceremony/core";

export type Submission = "queued" | "duplicate" | "conflict" | "full";

export interface JobSink {
  submit(spec: JobSpec): Submission;
  healthy(): boolean;
}

export interface DispatchAuth {
  hmacKey: string;
  ceremonyId: string;
}
