/** `init` options. */
import { join } from "node:path";
import {
  asCeremonyId,
  asCircuitName,
  asTag,
  type CircuitName,
  MAX_CIRCUITS,
} from "@orbinum-ceremony/core";
import { optionalPath, parseOptions, pathOption, required, UsageError } from "../../args";

/** One circuit of the ceremony and its on-chain `CircuitId`. */
export interface InitCircuitOption {
  name: CircuitName;
  circuitId: number;
}

/** The ceremony id, the audited release to build, its circuits, and where. */
export interface InitOptions {
  ceremonyId: string;
  circuitsRepo: string;
  circuitsRef: string;
  circuits: InitCircuitOption[];
  out: string;
  ptau?: string;
  checkDeterminism: boolean;
  force: boolean;
  /** Accept circuits past what the session and verifier bounds were measured for. */
  beyondMeasuredBounds: boolean;
}

/** Usage text, printed by `--help` and on a usage error. */
export const INIT_USAGE = `orbinum-ceremony init --ceremony-id <id> --circuits-repo <path> --circuits-ref <tag>
      --circuit-ids <name>=<id>[,<name>=<id>…]
                             the circuits of the ceremony, each with its on-chain CircuitId
                             (e.g. shield=3,unshield=2,transfer=1); each must be in the release's
                             manifest.json, whose active version + 1 the ceremony key becomes
    [--out <dir>]            default: artifacts/<ceremony-id>
    [--ptau <file>]          use a local ptau instead of downloading it (hash is still checked)
    [--check-determinism]    build every genesis twice and require identical bytes (A1/A3)
    [--force]                rebuild a ceremony directory not yet announced or contributed to
    [--beyond-measured-bounds]
                             accept circuits larger than the session and verifier bounds were
                             measured for, once those bounds have been re-measured and raised`;

/** Parses argv; a bad option is a `UsageError`. */
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

const CIRCUIT_ID = /^[1-9][0-9]{0,9}$/;

/** `name=id,…`: well-formed names, ids in 1..2^32-1, no name or id twice. */
export function parseCircuitIds(text: string): InitCircuitOption[] {
  const entries = text.split(",");
  if (entries.length > MAX_CIRCUITS) {
    throw new UsageError(`--circuit-ids: at most ${MAX_CIRCUITS} circuits`);
  }
  const circuits = entries.map((entry) => {
    const [name = "", id = "", ...rest] = entry.trim().split("=");
    let circuitName: CircuitName;
    try {
      circuitName = asCircuitName(name, "--circuit-ids");
    } catch {
      throw new UsageError(`--circuit-ids: "${name}" is not a circuit name ([a-z][a-z0-9_]*)`);
    }
    if (rest.length > 0 || !CIRCUIT_ID.test(id) || Number(id) > 0xffff_ffff) {
      throw new UsageError(`--circuit-ids: "${entry.trim()}" is not <name>=<on-chain id>`);
    }
    return { name: circuitName, circuitId: Number(id) };
  });
  if (new Set(circuits.map((c) => c.name)).size !== circuits.length) {
    throw new UsageError("--circuit-ids: a circuit appears twice");
  }
  if (new Set(circuits.map((c) => c.circuitId)).size !== circuits.length) {
    throw new UsageError("--circuit-ids: two circuits share an id");
  }
  return circuits;
}
