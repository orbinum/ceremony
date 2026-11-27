/** `GET /api/session/head/:circuit`: what the next contribution to the circuit must extend. */
import { type CircuitName, CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { call } from "../http";
import type { Head } from "../types";

export const getHead = (circuit: CircuitName) => call<Head>("GET", CONTRIBUTOR_PATHS.head(circuit));
