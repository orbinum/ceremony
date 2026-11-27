/** `GET /api/session/result/:circuit`: the latest upload of the circuit and its verdict. */
import { type CircuitName, CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { call } from "../http";
import type { JobResult } from "../types";

export const getResult = (circuit: CircuitName) =>
  call<JobResult>("GET", CONTRIBUTOR_PATHS.result(circuit));
