/** The bounds of an isolated task and the two messages parent and child exchange over IPC. */
export interface Limits {
  timeoutMs: number;
  maxRssBytes: number;
}

export interface TaskMessage<T> {
  task: T;
  maxRssBytes: Limits["maxRssBytes"];
}

export type ReplyMessage<R> = { ok: true; value: R } | { ok: false; error: string; code?: string };
