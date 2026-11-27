/** `POST /admin/state`: one operator action. */
import { asOneOf, OPERATOR_ACTIONS } from "@orbinum-ceremony/core";
import { jsonBody } from "./json-body";

export const operatorAction = jsonBody((v) => ({
  action: asOneOf((v as { action?: unknown }).action, "action", OPERATOR_ACTIONS),
}));
