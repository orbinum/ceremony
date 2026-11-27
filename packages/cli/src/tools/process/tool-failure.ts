/** The error of a tool that had to succeed: the program, how it ended and its redacted stderr, never argv. */
import { redact } from "../../io";
import { howItEnded } from "./how-it-ended";
import type { ToolResult } from "./types";

export const toolFailure = (cmd: string, r: ToolResult) =>
  new Error(`${cmd} failed (${howItEnded(r)}): ${redact(r.stderr.trim())}`);
