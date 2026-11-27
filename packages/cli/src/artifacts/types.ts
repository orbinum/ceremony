/** Types shared by the ceremony document loaders. */

export interface Loaded<T> {
  value: T;
  sha256: string;
}
