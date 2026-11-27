/** A session's receipt: its records, each with its chain value. */
import type { Receipt } from "@orbinum-ceremony/core";
import { call } from "../http";

export const getReceipt = (seq: number) => call<Receipt>("GET", `/api/receipt/${seq}`);
