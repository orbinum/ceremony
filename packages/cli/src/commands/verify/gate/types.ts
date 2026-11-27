/** The cheap checks each circuit (or the ptau) failed, by id. */
import type { CircuitName } from "@orbinum-ceremony/core";
import type { PTAU_PREREQUISITE } from "./constants";

export type Failed = Map<CircuitName | typeof PTAU_PREREQUISITE, string[]>;
