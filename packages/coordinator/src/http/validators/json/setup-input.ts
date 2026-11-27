/** `POST /admin/configure`: the published texts and genesis sizes; core parses them later. */
import type { SetupInput } from "@orbinum-ceremony/core";
import { jsonBody } from "./json-body";

export const setupInput = jsonBody((v): SetupInput => {
  const o = v as Partial<SetupInput>;
  if (typeof o.announcement !== "string" || typeof o.init !== "string") throw new Error("setup");
  return o as SetupInput;
});
