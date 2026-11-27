/** Runs one bucket call; whatever it throws becomes a `StorageError` naming the call. */
import { StorageError } from "./storage-error";

export async function guarded<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new StorageError(`${what}: ${(error as Error).message}`, { cause: error });
  }
}
