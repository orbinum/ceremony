/**
 * Hands the session's receipt to the browser as a file the contributor keeps: their records, each
 * with its chain value.
 */
import { type Receipt, serializeJson } from "@orbinum-ceremony/core";
import { receiptFileName } from "./receipt-file-name";

export function saveReceipt(r: Receipt): void {
  const url = URL.createObjectURL(new Blob([serializeJson(r)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: receiptFileName(r) });
  a.click();
  URL.revokeObjectURL(url);
}
