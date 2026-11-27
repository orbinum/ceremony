/** The lifetime left to a CLI token, read from its own (unverified) payload; 0 if it has none. */

export function tokenLifeMs(token: string, now: number): number {
  try {
    const body = token.slice(0, token.indexOf("."));
    const exp = (JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { exp?: unknown })
      .exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp - now : 0;
  } catch {
    return 0;
  }
}
