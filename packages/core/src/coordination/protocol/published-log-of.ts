/** A verify log as it is published and hashed: printable text, bounded. */
import { MAX_LOG_CHARS } from "../../config";
import { toLogText } from "../../primitives/schema";

export const publishedLogOf = (rawLog: string): string => toLogText(rawLog, MAX_LOG_CHARS);
