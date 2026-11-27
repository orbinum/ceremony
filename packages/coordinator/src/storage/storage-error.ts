/**
 * The bucket failed, not the bytes: the caller answers `storage` and may retry. Every failure of a
 * bucket call becomes one, told apart from bytes that were wrong.
 */
export class StorageError extends Error {
  override readonly name = "StorageError";
}
