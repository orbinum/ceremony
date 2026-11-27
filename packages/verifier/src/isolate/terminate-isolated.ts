/** Kills every isolated task still running, on shutdown; their callers see `crashed`. */
import { liveChildren } from "./live-children";

export function terminateIsolated(): void {
  for (const child of liveChildren) child.kill("SIGKILL");
}
