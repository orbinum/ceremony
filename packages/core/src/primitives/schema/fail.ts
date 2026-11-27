/**
 * The refusal every field validator throws: a `FormatError` naming the field path, so a refused
 * document says which field was wrong.
 */
import { FormatError } from "../errors";

export const fail = (path: string, message: string): never => {
  throw new FormatError(`${path}: ${message}`);
};
