/** The coordinator no longer takes this CLI token: the run can neither go on nor end the session. */

export class TokenRefused extends Error {
  override readonly name = "TokenRefused";
}
