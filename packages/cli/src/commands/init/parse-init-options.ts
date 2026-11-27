/** Parses `init` argv; a bad option is a `UsageError`. */
import { join } from "node:path";
import { asCeremonyId, asTag } from "@orbinum-ceremony/core";
import { optionalPath, parseOptions, pathOption, required, UsageError } from "../../args";
import { parseCircuitIds } from "./parse-circuit-ids";
import type { InitOptions } from "./types";

export function parseInitOptions(argv: string[]): InitOptions {
  const values = parseOptions(argv, {
    "ceremony-id": { type: "string" },
    "circuits-repo": { type: "string" },
    "circuits-ref": { type: "string" },
    "circuit-ids": { type: "string" },
    out: { type: "string" },
    ptau: { type: "string" },
    "check-determinism": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    "beyond-measured-bounds": { type: "boolean", default: false },
  });
  let ceremonyId: string;
  try {
    ceremonyId = asCeremonyId(required(values["ceremony-id"], "ceremony-id"), "--ceremony-id");
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError("--ceremony-id must be 1–64 of [a-z0-9-]");
  }
  const circuitsRef = required(values["circuits-ref"], "circuits-ref");
  try {
    asTag(circuitsRef, "circuits-ref");
  } catch {
    throw new UsageError("--circuits-ref must be a release tag name");
  }
  const ptau = optionalPath(values.ptau);
  return {
    ceremonyId,
    circuitsRepo: pathOption(required(values["circuits-repo"], "circuits-repo")),
    circuitsRef,
    circuits: parseCircuitIds(required(values["circuit-ids"], "circuit-ids")),
    out: pathOption(values.out ?? join("artifacts", ceremonyId)),
    ...(ptau ? { ptau } : {}),
    checkDeterminism: values["check-determinism"],
    force: values.force,
    beyondMeasuredBounds: values["beyond-measured-bounds"],
  };
}
