/** A circuit's head in a configured ceremony; null if the ceremony does not have the circuit. */
import type { CircuitName } from "../../config";
import { type Chained, genesisOf, headOf, type Setup } from "../../ceremony";

export function headOfSetup(setup: Setup, records: readonly Chained[], circuit: CircuitName) {
  const genesis = genesisOf(setup, circuit);
  return genesis
    ? headOf(records, circuit, { sha256: genesis.genesis_sha256, csHash: genesis.cs_hash })
    : null;
}
