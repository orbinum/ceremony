/**
 * The one form of Vite's `import.meta.glob` the tests use (a file's text, read at build time),
 * typed here so the package needs no direct dependency on Vite's client types.
 */
interface ImportMeta {
  glob<T>(
    pattern: string,
    options: { query: "?raw"; import: "default"; eager: true },
  ): Record<string, T>;
}
