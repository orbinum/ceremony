/** `null`, or a value `read` accepts. */
export function asNullable<T>(value: unknown, read: (v: unknown) => T): T | null {
  return value === null ? null : read(value);
}
