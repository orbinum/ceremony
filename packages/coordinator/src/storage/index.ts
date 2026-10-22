// coordinator/storage: R2 calls as the ceremony relies on them (exact, guarded, never blind).
export {
  BytesMismatch,
  deleteQuietly,
  getObject,
  headObject,
  holds,
  putObject,
  replaceObject,
  StorageError,
  streamExact,
} from "./r2";
