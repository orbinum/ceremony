/** The session's receipt as a file the contributor keeps: their records, each with its chain value. */
import { type Receipt, serializeJson } from "@orbinum-ceremony/core";

/** The receipt's file name: the ceremony and the session. */
export const receiptFileName = (r: Receipt) => `${r.ceremony_id}-session-${r.seq}-receipt.json`;

/** Hands the receipt to the browser as a download. */
export function saveReceipt(r: Receipt): void {
  const url = URL.createObjectURL(new Blob([serializeJson(r)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: receiptFileName(r) });
  a.click();
  URL.revokeObjectURL(url);
}
