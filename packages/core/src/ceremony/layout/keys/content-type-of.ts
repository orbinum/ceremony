/** The media type a published ceremony file is served with, by its extension. */
export function contentTypeOf(key: string): string {
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".log")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}
