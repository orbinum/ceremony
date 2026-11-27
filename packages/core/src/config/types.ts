/**
 * Types the config layer shares. A circuit is named by the ceremony, not by this code: `init`
 * takes the circuits and their on-chain ids from the operator and everything else from the
 * announced circuits release, and `genesis/init.json` pins them, in session order.
 */
export type CircuitName = string;
