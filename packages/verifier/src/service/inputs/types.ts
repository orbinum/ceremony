/**
 * The pinned inputs every verification runs against: the staged private copies of the ptau and of
 * each circuit's genesis (with its init.json pin), the stage that owns them (cleaned up on
 * shutdown), the outcome of the last pin check (at startup, then before each job), and where the
 * copies come from, to stage them again if the host removes them.
 */
import type { CircuitName, InitRecord } from "@orbinum-ceremony/core";
import type { Stage } from "../../files";
import type { ServiceConfig } from "../config";

export interface Inputs {
  init: InitRecord;
  ptau: string;
  genesis: Record<CircuitName, { path: string; sha256: string }>;
  stage: Stage;
  pinned: boolean;
  sources: Pick<ServiceConfig, "ceremonyDir" | "ptau">;
}

export type StagedCopies = Pick<Inputs, "ptau" | "genesis" | "stage">;
