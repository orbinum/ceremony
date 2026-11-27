/** `GET /api/status`: the ceremony's phase and counts, nothing about who is in line. */
import { call } from "../http";
import type { Status } from "../types";

export const getStatus = () => call<Status>("GET", "/api/status");
