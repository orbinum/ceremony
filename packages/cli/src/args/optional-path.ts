/** An optional path option, made absolute when given. */
import { resolve } from "node:path";

export const optionalPath = (value: string | undefined): string | undefined =>
  value ? resolve(value) : undefined;
