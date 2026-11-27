/** The SHA-256 that `init.json` pins for a circuit's genesis zkey or r1cs. */
import type { CircuitName } from "../../config";
import { circuitOf } from "./circuit-of";
import type { InitRecord } from "./types";

export const pinOf = (init: InitRecord, circuit: CircuitName, kind: "genesis" | "r1cs"): string =>
  kind === "genesis"
    ? circuitOf(init, circuit).genesis_sha256
    : circuitOf(init, circuit).r1cs_sha256;
