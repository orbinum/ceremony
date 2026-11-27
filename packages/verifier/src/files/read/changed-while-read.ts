/** The error of a file that gave fewer bytes than the size it had when it was opened. */
import { basename } from "node:path";

export const changedWhileRead = (path: string) =>
  new Error(`${basename(path)}: changed while being read`);
