/**
 * The error for a coordinator answer that refused a call: its status and the start of its body as
 * printable text (at most 1 KiB; the rest is never read).
 */
import { toPrintable } from "@orbinum-ceremony/core";

const MAX_ERROR_BODY_BYTES = 1024;

async function cappedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_ERROR_BODY_BYTES) {
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_ERROR_BODY_BYTES));
  return toPrintable(text, MAX_ERROR_BODY_BYTES);
}

export const refusalError = async (what: string, response: Response) =>
  new Error(`${what}: the coordinator answered ${response.status} ${await cappedText(response)}`);
