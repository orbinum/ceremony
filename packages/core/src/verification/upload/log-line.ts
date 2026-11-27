/**
 * One line of a verify log, as the verifier records snarkjs' logger. Imports nothing: the snarkjs
 * child loads it without the barrel's wallet libraries.
 */
export const logLine = (level: string, message: string): string => `[${level}] ${message}`;
