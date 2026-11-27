/** A streamed body that is not exactly the declared bytes: the client's fault, not the bucket's. */
export class BytesMismatch extends Error {
  override readonly name = "BytesMismatch";
}
