/**
 * The subset of snarkjs 0.7.6 this package calls (it ships no types). Every file that imports
 * snarkjs references it, so the types reach every package that compiles those files.
 */
declare module "snarkjs" {
  interface Logger {
    debug(msg: string): void;
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  }

  export const zKey: {
    newZKey(r1cs: string, ptau: string, zkey: string, logger?: Logger): Promise<Uint8Array>;
    contribute(
      oldZkey: string,
      newZkey: string,
      name: string,
      entropy: string,
      logger?: Logger,
    ): Promise<Uint8Array>;
    beacon(
      oldZkey: string,
      newZkey: string,
      name: string,
      beaconHashHex: string,
      numIterationsExp: number,
      logger?: Logger,
    ): Promise<Uint8Array | false>;
    verifyFromR1cs(r1cs: string, ptau: string, zkey: string, logger?: Logger): Promise<boolean>;
    verifyFromInit(initZkey: string, ptau: string, zkey: string, logger?: Logger): Promise<boolean>;
    exportVerificationKey(zkey: string, logger?: Logger): Promise<Record<string, unknown>>;
  };
}
