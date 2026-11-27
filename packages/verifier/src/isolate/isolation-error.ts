/**
 * An isolated task that was stopped or died: a resource problem (`timeout`, `memory`, `crashed`),
 * not the task's own error. `stderr` is what the child printed, redacted and bounded; it stays out
 * of the message, which may leave the host.
 */
export type IsolationFailure = "timeout" | "memory" | "crashed";

export class IsolationError extends Error {
  override readonly name = "IsolationError";
  constructor(
    readonly failure: IsolationFailure,
    message: string,
    readonly stderr = "",
  ) {
    super(message);
  }
}
