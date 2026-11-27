/**
 * A client build: printable name and version, a 7–40 hex commit. `allowLocal` also accepts
 * `LOCAL_BUILD`, for transcripts of simulated ceremonies; signed and online paths never do.
 */
import { asRecord, asString, NONEMPTY_PRINTABLE, SHORT_COMMIT } from "../../primitives/schema";
import { LOCAL_BUILD } from "./constants";
import type { ClientInfo } from "./types";

export function asClientInfo(v: unknown, p: string, { allowLocal = false } = {}): ClientInfo {
  const o = asRecord(v, p, ["name", "version", "commit"]);
  return {
    name: asString(o.name, `${p}.name`, 64, NONEMPTY_PRINTABLE),
    version: asString(o.version, `${p}.version`, 32, NONEMPTY_PRINTABLE),
    commit:
      allowLocal && o.commit === LOCAL_BUILD
        ? LOCAL_BUILD
        : asString(o.commit, `${p}.commit`, 40, SHORT_COMMIT),
  };
}
