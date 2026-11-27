/** A refusal answered by the coordinator: its HTTP status and its error code (core's codes). */

export class CoordinatorRefusal extends Error {
  override readonly name = "CoordinatorRefusal";
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}
