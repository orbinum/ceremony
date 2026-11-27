/** How a tool ended, for error messages: "exit 3" or "killed by SIGKILL". */
import type { ToolResult } from "./types";

export const howItEnded = (r: ToolResult): string =>
  r.signal ? `killed by ${r.signal}` : `exit ${r.code}`;
