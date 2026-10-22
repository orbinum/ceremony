/** snarkjs Groth16 zkey layout (`zkey_utils.js`). */

/**
 * Section ids a zkey uses: `l` and `h` hold the G1 points a contribution rescales, `mpcParams`
 * csHash and the contribution chain.
 */
export const ZKEY_SECTION = { header: 1, groth16Header: 2, l: 8, h: 9, mpcParams: 10 } as const;

/** Every section of a zkey, in the order `zkey contribute` and `zkey beacon` write them. */
export const ZKEY_SECTION_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** The binfile version snarkjs 0.7.6 writes. */
export const ZKEY_VERSION = 1;
