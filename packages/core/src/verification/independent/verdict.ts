/**
 * The independent Rust verifier's JSON verdict (github.com/orbinum/ceremony-verifier), read
 * strictly: the exact set of check ids, a minimum version, and an exit code that agrees with the
 * verdict, so a binary that skips a check or lies about passing never counts. SPEC §8.4.
 */
import { MAX_CONTRIBUTIONS } from "../../config";
import { FormatError } from "../../primitives/errors";
import {
  asArray,
  asHex,
  asObject,
  asOneOf,
  asSafeInt,
  asString,
  PRINTABLE,
} from "../../primitives/schema";

/** Check ids the Rust verifier must report, every time. */
export const REQUIRED_CHECKS = [
  "well-formed",
  "genesis-start",
  "genesis-source",
  "unchanged",
  "policy",
  "chain",
  "final-delta",
  "scaled-sections",
] as const;

/** The verifier's name and the oldest release whose checks are relied on. */
const INDEPENDENT_VERIFIER = { name: "ceremony-verifier", minVersion: [0, 1, 0] } as const;

/** The verdict on one final key. */
export interface IndependentVerdict {
  ok: boolean;
  /** Ids of the checks that failed, with their detail. */
  failures: string[];
  /** csHash of the final key, as the independent implementation read it (absent if unreadable). */
  csHash?: string;
  /** h_k per MPC entry, in order, as the independent implementation computed them. */
  entries: { kind: "contribution" | "beacon"; hash: string }[];
}

function checkVersion(verifier: string): void {
  const [name, version, ...rest] = verifier.split(" ");
  if (name !== INDEPENDENT_VERIFIER.name || rest.length > 0) {
    throw new FormatError(`verdict: not a ${INDEPENDENT_VERIFIER.name} verdict`);
  }
  const parts = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/
    .exec(version ?? "")
    ?.slice(1)
    .map(Number);
  if (!parts) throw new FormatError(`verdict: unreadable version ${JSON.stringify(version)}`);
  for (const [i, min] of INDEPENDENT_VERIFIER.minVersion.entries()) {
    const part = parts[i] as number;
    if (part > min) return;
    if (part < min) {
      throw new FormatError(
        `verdict: ${version} is older than ${INDEPENDENT_VERIFIER.minVersion.join(".")}`,
      );
    }
  }
}

/** Validates a parsed verdict; `exitedOk` is whether the process exited 0. */
export function readIndependentVerdict(raw: unknown, exitedOk: boolean): IndependentVerdict {
  const o = asObject(raw, "verdict");
  checkVersion(asString(o.verifier, "verdict.verifier", 200, PRINTABLE));
  const checks = asArray(o.checks, "verdict.checks", 100).map((c, i) => {
    const check = asObject(c, `verdict.checks[${i}]`);
    return {
      id: asString(check.id, `verdict.checks[${i}].id`, 100, PRINTABLE),
      ok: check.ok === true,
      detail:
        check.detail === undefined
          ? undefined
          : asString(check.detail, `verdict.checks[${i}].detail`, 2000),
    };
  });
  // Element by element: a joined string would let one id containing a comma stand for two.
  const ids = checks.map((c) => c.id).toSorted();
  const expected = [...REQUIRED_CHECKS].toSorted();
  if (ids.length !== expected.length || expected.some((id, i) => id !== ids[i])) {
    throw new FormatError(`verdict: checks [${ids.join(", ")}], expected [${expected.join(", ")}]`);
  }
  const passed = o.ok === true && checks.every((c) => c.ok);
  if (passed !== exitedOk) throw new FormatError("verdict: exit code and verdict disagree");
  return {
    ok: passed,
    failures: checks
      .filter((c) => !c.ok)
      .map((c) => (c.detail === undefined ? c.id : `${c.id}: ${c.detail}`)),
    ...(o.cs_hash === undefined ? {} : { csHash: asHex(o.cs_hash, "verdict.cs_hash", 64) }),
    entries: asArray(o.entries, "verdict.entries", MAX_CONTRIBUTIONS + 1).map((e, i) => {
      const entry = asObject(e, `verdict.entries[${i}]`);
      asSafeInt(entry.index, `verdict.entries[${i}].index`, i + 1, i + 1);
      return {
        kind: asOneOf(entry.kind, `verdict.entries[${i}].kind`, [
          "contribution",
          "beacon",
        ] as const),
        hash: asHex(entry.hash, `verdict.entries[${i}].hash`, 64),
      };
    }),
  };
}

/** Every way the verdict disagrees with the transcript's accepted chain for one circuit. */
export function compareIndependent(
  verdict: IndependentVerdict,
  recorded: readonly string[],
  csHash: string,
): string[] {
  const problems: string[] = [];
  const contributions = verdict.entries.filter((e) => e.kind === "contribution").map((e) => e.hash);
  if (contributions.length !== recorded.length || contributions.some((h, i) => h !== recorded[i])) {
    problems.push("its h_k chain differs from the transcript");
  }
  if (verdict.csHash !== csHash) problems.push("its csHash differs from init.json");
  return problems;
}
