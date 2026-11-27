/** The receipt's file name: the ceremony and the session. */
import type { Receipt } from "@orbinum-ceremony/core";

export const receiptFileName = (r: Receipt) => `${r.ceremony_id}-session-${r.seq}-receipt.json`;
