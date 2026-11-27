/** The `contribute-local` usage text, printed by `--help` and on a usage error. */
import { CEREMONY_LAYOUT } from "@orbinum-ceremony/core";

export const CONTRIBUTE_LOCAL_USAGE = `orbinum-ceremony contribute-local --dir <ceremony dir from init>
    Rehearsals only (local or testnet ceremonies).
    [--contributors <n>]    default: 3 (at most 1000)
    [--ptau <file>]         default: <dir>/${CEREMONY_LAYOUT.ptau}
    [--cross-check-r1cs]    also verify every upload from r1cs and require the same verdict`;
