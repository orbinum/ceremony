/** The isolated children still running, so a shutting-down host can stop them. */
import type { ChildProcess } from "node:child_process";

export const liveChildren = new Set<ChildProcess>();
