/**
 * A key of one ceremony's folder as R2 takes it, or null: R2 keys are at most 1024 bytes, folder
 * included (a ceremony id and a slash, at most 65), so a longer one is not found rather than a
 * storage error.
 */
export const folderKey = (key: string): string | null =>
  key.length > 0 && new TextEncoder().encode(key).length <= 1024 - 65 ? key : null;
