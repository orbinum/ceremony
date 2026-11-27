/**
 * `genesis/init.json` read from outside. Circuit names are well formed (they become file paths),
 * each name and on-chain id at most once, in session order, each domain the one its shape needs,
 * each `ceremony_version` at least 1 (the release's active version plus one); the source is a full
 * commit id. The pins against the config are `checkInitAgainstConfig`'s.
 */
import { MAX_CIRCUITS } from "../../../config";
import { domainPower } from "../../../formats";
import { FormatError } from "../../../primitives/errors";
import {
  asArray,
  asCeremonyId,
  asCircuitName,
  asCommit,
  asCount,
  asHex,
  asIsoTime,
  asRecord,
  asSafeInt,
  asSchema,
  asString,
  TOKEN,
  VERSION,
} from "../../../primitives/schema";
import { INIT_SCHEMA } from "../constants";
import { sessionOrder } from "../circuits";
import type { InitCircuit, InitRecord } from "../types";

function circuit(v: unknown, p: string): InitCircuit {
  const o = asRecord(v, p, [
    "name",
    "circuit_id",
    "ceremony_version",
    "r1cs_sha256",
    "constraints",
    "public_signals",
    "wires",
    "domain_power",
    "genesis_sha256",
    "cs_hash",
  ]);
  const c: InitCircuit = {
    name: asCircuitName(o.name, `${p}.name`),
    circuit_id: asSafeInt(o.circuit_id, `${p}.circuit_id`, 1, 0xffff_ffff),
    ceremony_version: asSafeInt(
      o.ceremony_version,
      `${p}.ceremony_version`,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    r1cs_sha256: asHex(o.r1cs_sha256, `${p}.r1cs_sha256`, 32),
    constraints: asCount(o.constraints, `${p}.constraints`),
    public_signals: asCount(o.public_signals, `${p}.public_signals`),
    wires: asCount(o.wires, `${p}.wires`),
    domain_power: asSafeInt(o.domain_power, `${p}.domain_power`, 1, 28),
    genesis_sha256: asHex(o.genesis_sha256, `${p}.genesis_sha256`, 32),
    cs_hash: asHex(o.cs_hash, `${p}.cs_hash`, 64),
  };
  const shape = { constraints: c.constraints, publicOutputs: c.public_signals, publicInputs: 0 };
  if (domainPower(shape) !== c.domain_power) {
    throw new FormatError(`${p}.domain_power: not the domain its constraints and signals need`);
  }
  return c;
}

export function validateInit(v: unknown): InitRecord {
  const o = asRecord(v, "init", [
    "schema",
    "ceremony_id",
    "created_at",
    "ptau",
    "tooling",
    "source",
    "circuits",
  ]);
  const ptau = asRecord(o.ptau, "init.ptau", ["file", "blake2b512", "size"]);
  const tooling = asRecord(o.tooling, "init.tooling", [
    "snarkjs",
    "circom",
    "circomlib",
    "circom_flags",
  ]);
  const source = asRecord(o.source, "init.source", ["ref", "commit"]);
  const circuits = asArray(o.circuits, "init.circuits", MAX_CIRCUITS, 1).map((c, i) =>
    circuit(c, `init.circuits[${i}]`),
  );
  if (new Set(circuits.map((c) => c.name)).size !== circuits.length) {
    throw new FormatError("init.circuits: duplicate circuit");
  }
  if (new Set(circuits.map((c) => c.circuit_id)).size !== circuits.length) {
    throw new FormatError("init.circuits: duplicate circuit_id");
  }
  if (sessionOrder(circuits).some((c, i) => c !== circuits[i])) {
    throw new FormatError("init.circuits: not in session order (fewest constraints first)");
  }

  return {
    schema: asSchema(o.schema, "init.schema", INIT_SCHEMA),
    ceremony_id: asCeremonyId(o.ceremony_id, "init.ceremony_id"),
    created_at: asIsoTime(o.created_at, "init.created_at"),
    ptau: {
      file: asString(ptau.file, "init.ptau.file", 64, /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.ptau$/),
      blake2b512: asHex(ptau.blake2b512, "init.ptau.blake2b512", 64),
      size: asCount(ptau.size, "init.ptau.size"),
    },
    tooling: {
      snarkjs: asString(tooling.snarkjs, "init.tooling.snarkjs", 32, VERSION),
      circom: asString(tooling.circom, "init.tooling.circom", 32, VERSION),
      circomlib: asString(tooling.circomlib, "init.tooling.circomlib", 32, VERSION),
      circom_flags: asArray(tooling.circom_flags, "init.tooling.circom_flags", 8).map((f, i) =>
        asString(f, `init.tooling.circom_flags[${i}]`, 16, /^--[A-Za-z0-9]+$/),
      ),
    },
    source: {
      ref: asString(source.ref, "init.source.ref", 100, TOKEN),
      commit: asCommit(source.commit, "init.source.commit"),
    },
    circuits,
  };
}
