/**
 * Freezes the setup, once, if it is valid and describes the published files: `ceremony.json` and
 * `init.json` exactly the configured texts, each genesis of the size and hash the setup names, each
 * r1cs of its pinned hash and, outside a local rehearsal, the ptau of its pinned size (it is pinned
 * by BLAKE2b-512, which R2 does not check). Setup files freeze with the setup, so a missing or wrong
 * one could never be put right afterwards. A deployment runs one network: testnet never freezes a
 * mainnet (or a check-skipping `local`) ceremony, nor production a testnet one; a local run
 * rehearses any. A deployment pinned to one announcement by `ANNOUNCEMENT_SHA256` freezes no other,
 * so the inputs the verifier container mirrors are fixed in the deployed config.
 */
import {
  CEREMONY_LAYOUT,
  parseSetup,
  type Setup,
  type SetupInput,
  sha256Hex,
  utf8,
} from "@orbinum-ceremony/core";
import { ceremony } from "../../durable";
import { type Bucket, headObject, holds, publicBucket } from "../../storage";
import { fromOutcome, refuse } from "../result";
import type { Result } from "../types";

async function publishedProblems(bucket: Bucket, input: SetupInput, setup: Setup) {
  const problems: string[] = [];
  for (const [key, text] of [
    [CEREMONY_LAYOUT.announcement, input.announcement],
    [CEREMONY_LAYOUT.init, input.init],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop
    const object = await headObject(bucket, key);
    if (!object) problems.push(`${key} not published`);
    else if (!holds(object, sha256Hex(utf8(text)))) problems.push(`published ${key} differs`);
  }
  for (const c of setup.init.circuits) {
    // oxlint-disable-next-line no-await-in-loop
    const object = await headObject(bucket, CEREMONY_LAYOUT.zkey(c.name, 0));
    if (!object) problems.push(`${c.name}: genesis not published`);
    else if (object.size !== setup.genesisSizes[c.name] || !holds(object, c.genesis_sha256)) {
      problems.push(`${c.name}: published genesis differs from the setup`);
    }
    // oxlint-disable-next-line no-await-in-loop
    const r1cs = await headObject(bucket, CEREMONY_LAYOUT.r1cs(c.name));
    if (!r1cs) problems.push(`${c.name}: r1cs not published`);
    else if (!holds(r1cs, c.r1cs_sha256)) problems.push(`${c.name}: published r1cs differs`);
  }
  if (setup.announcement.network !== "local") {
    const ptau = await headObject(bucket, CEREMONY_LAYOUT.ptau);
    if (ptau?.size !== setup.init.ptau.size) problems.push("ptau not published at its size");
  }
  return problems;
}

const NETWORK_OF: Record<string, string> = { production: "mainnet", testnet: "testnet" };

export async function configureCeremony(env: Env, input: SetupInput): Promise<Result> {
  let setup: Setup;
  try {
    setup = parseSetup(input, env.CEREMONY_ID);
  } catch (error) {
    return refuse("malformed-setup", (error as Error).message);
  }
  const network = NETWORK_OF[env.ENVIRONMENT];
  if (network && setup.announcement.network !== network) {
    return refuse("malformed-setup", `a ${env.ENVIRONMENT} coordinator runs ${network} ceremonies`);
  }
  if (env.ANNOUNCEMENT_SHA256 && setup.announcementSha256 !== env.ANNOUNCEMENT_SHA256) {
    return refuse("malformed-setup", "this deployment is pinned to another ceremony.json");
  }
  const problems = await publishedProblems(publicBucket(env), input, setup);
  if (problems.length > 0) return refuse("malformed-setup", problems.join("; "));
  return fromOutcome(await ceremony(env).configure(input));
}
