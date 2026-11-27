/** The bytes of a file a head names (`Head.url`). */
import { getBytes } from "../http";

export const download = (url: string) => getBytes(url);
