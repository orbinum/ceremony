/**
 * A snarkjs logger that collects its lines, so a verification can require the success marker and
 * keep the log. Imports core's light `snarkjs-child` entry: this runs in every snarkjs child.
 */
import { logLine } from "@orbinum-ceremony/core/snarkjs-child";

export function captureLogger() {
  const lines: string[] = [];
  const push = (level: string) => (msg: string) => lines.push(logLine(level, msg));
  return {
    lines,
    logger: { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") },
  };
}
