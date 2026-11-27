/** The `finalize` usage text, printed by `--help` and on a usage error. */
import { CEREMONY_LAYOUT } from "@orbinum-ceremony/core";

export const FINALIZE_USAGE = `orbinum-ceremony finalize --dir <ceremony dir>
    [--ptau <file>]          default: <dir>/${CEREMONY_LAYOUT.ptau}
    [--vk-packer <bin>]      groth16-proofs pack-verifying-key; required unless the network is local
The beacon round is the one ceremony.json announced; it cannot be chosen here.`;
