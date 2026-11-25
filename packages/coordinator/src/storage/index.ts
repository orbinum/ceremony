// coordinator/storage: R2 calls as the ceremony relies on them (exact, guarded, never blind).
export {
  archivedBucket,
  archivedCeremonies,
  type Bucket,
  privateBucket,
  publicBucket,
  scoped,
} from "./buckets";
export {
  BytesMismatch,
  deleteQuietly,
  getObject,
  getObjectIfChanged,
  headObject,
  holds,
  putObject,
  replaceObject,
  StorageError,
  streamExact,
} from "./r2";
