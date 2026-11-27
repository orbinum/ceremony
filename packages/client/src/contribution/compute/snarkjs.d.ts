/**
 * The part of snarkjs 0.7.6 the worker calls (it ships no types), files as bytes in memory:
 * `contribute` writes the new key into `next.data` and returns h_k (BLAKE2b-512).
 */
declare module "snarkjs" {
  export const zKey: {
    contribute(
      previous: Uint8Array,
      next: { type: "mem"; data?: Uint8Array },
      name: string,
      entropy: string,
    ): Promise<Uint8Array>;
  };
}
