/** A path option, made absolute. */
import { resolve } from "node:path";

export const pathOption = (value: string): string => resolve(value);
