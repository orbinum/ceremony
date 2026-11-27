/** A check that failed: the contribution stops before anything is uploaded. */
export class CheckFailed extends Error {
  override readonly name = "CheckFailed";
}
