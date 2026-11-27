/**
 * The ceremony's Durable Object, in layers: object (RPC surface, delegations only) → operations
 * (what each method does) → store (state, commit, publication, public copies) → db (SQLite). A
 * layer imports only lower ones.
 */
export { CeremonyDO, ceremony } from "./object";
export type { Outcome } from "./operations";
