/**
 * Why a mirror's redirect from `from` to `to` is not followed, or null. Once on https, no hop may
 * leave it nor point at an internal host (every file is pinned, but a public mirror must not make
 * this machine probe its own network); from plain http (a loopback mirror) a hop goes to https or
 * stays on loopback.
 */
import { LOOPBACK_HOSTS } from "@orbinum-ceremony/core";
import { isInternalHost } from "./is-internal-host";

export function redirectRefusal(from: URL, to: URL): string | null {
  if (from.protocol === "https:") {
    if (to.protocol !== "https:") return "redirected from https to plain http";
    if (isInternalHost(to.hostname)) return "redirected from https to an internal host";
    return null;
  }
  if (to.protocol === "https:") return null;
  if (to.protocol === "http:" && LOOPBACK_HOSTS.includes(to.hostname)) return null;
  return "redirected from plain http to neither https nor loopback";
}
