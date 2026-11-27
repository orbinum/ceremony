/**
 * The GitHub callback's outcome as the page words it, read once; the query is then dropped so a
 * reload does not repeat it.
 */
import { useState } from "react";
import { signInOutcomeOf } from "../../../api";
import { signInText } from "../text";

export function useSignInOutcome() {
  const [outcome] = useState(() => {
    const o = signInOutcomeOf(window.location.search);
    if (o) window.history.replaceState(null, "", window.location.pathname);
    return o && signInText(o);
  });
  return outcome;
}
