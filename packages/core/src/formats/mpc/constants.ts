/**
 * The snarkjs Groth16 zkey layout (`zkey_utils.js`). `ZKEY_SECTION` names the sections this code
 * reads: `l` and `h` hold the G1 points a contribution rescales, `mpcParams` the csHash and the
 * contribution chain. `ZKEY_SECTION_ORDER` is every section in the order `zkey contribute` and
 * `zkey beacon` write them; `ZKEY_VERSION` is the binfile version snarkjs 0.7.6 writes.
 */
export const ZKEY_SECTION = { header: 1, groth16Header: 2, l: 8, h: 9, mpcParams: 10 } as const;

export const ZKEY_SECTION_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const ZKEY_VERSION = 1;
