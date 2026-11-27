/**
 * The ceremony's object as tests drive it: wallets linked straight in the object (signed as wallets
 * sign, since the Worker verifies signatures before it calls `link`) for tests about the queue rather
 * than the link route, state edits as if time had passed, the transcript, and its buckets wrapped so
 * a hook can fail a call or change state meanwhile.
 */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { Chained, LinkPayload, QueueState } from "@orbinum-ceremony/core";
import { type BaseWallet, Wallet } from "ethers";
import { inFolder } from "./buckets";
import { signLinkEvm } from "./wallets";

export type Ceremony = ReturnType<typeof env.CEREMONY.getByName>;

export const stubOf = (id: string): Ceremony => env.CEREMONY.getByName(id);

export async function linkDirect(
  stub: Ceremony,
  githubId: number,
  wallet: BaseWallet = Wallet.createRandom(),
): Promise<BaseWallet> {
  const issued = await stub.issueNonce(githubId);
  if (!issued.ok) throw new Error(`nonce refused: ${issued.refusal}`);
  const payload: LinkPayload = {
    ceremony_id: env.CEREMONY_ID,
    github_id: githubId,
    github_login: `user-${githubId}`,
    account: wallet.address,
    nonce: issued.nonce,
    issued_at: Math.floor(Date.now() / 1000),
  };
  const r = await stub.link({
    githubId,
    login: payload.github_login,
    scheme: "eip712",
    account: wallet.address,
    accountKey: wallet.address.toLowerCase(),
    signature: await signLinkEvm(wallet, payload),
    nonce: payload.nonce,
    issuedAt: payload.issued_at,
  });
  if (!r.ok) throw new Error(`link refused: ${r.refusal}`);
  return wallet;
}

export const readTranscript = async (stub: Ceremony) =>
  (await stub.transcript()) as unknown as { chainGenesis: string; records: Chained[] };

export const setQueue = (stub: Ceremony, edit: (s: QueueState) => void) =>
  runInDurableObject(stub, (_, state) => {
    const row = state.storage.sql.exec<{ json: string }>("SELECT json FROM queue_state").one();
    const s = JSON.parse(row.json) as QueueState;
    edit(s);
    state.storage.sql.exec("UPDATE queue_state SET json = ?", JSON.stringify(s));
  });

export const rewind = (stub: Ceremony, ms: number) =>
  setQueue(stub, (s) => {
    if (!s.slot) return;
    s.slot.grantedAt -= ms;
    s.slot.lastHeartbeat -= ms;
    if (s.slot.runningSince !== null) s.slot.runningSince -= ms;
  });

export const expireNonces = (stub: Ceremony) =>
  runInDurableObject(stub, (_, state) => {
    state.storage.sql.exec("UPDATE nonces SET expires_at = 0");
  });

type Bucket = "PUBLIC" | "PRIVATE";
type BucketHook = (
  method: string,
  key: unknown,
  sql: SqlStorage,
  instance: { apply: Ceremony["apply"] },
) => void | Promise<void>;

const realEnv = new WeakMap<object, Env>();
const storeOf = (instance: unknown) => (instance as { store: { env: Env } }).store;

export const wrapBucket = (stub: Ceremony, name: Bucket, hook: BucketHook) =>
  runInDurableObject(stub, (instance, state) => {
    const store = storeOf(instance);
    if (!realEnv.has(store)) realEnv.set(store, store.env);
    const bucket = store.env[name];
    const wrapped = new Proxy(bucket, {
      get(target, prop) {
        const value = (target as unknown as Record<PropertyKey, unknown>)[prop];
        if (typeof value !== "function") return value;
        return async (...args: unknown[]) => {
          await hook(String(prop), inFolder(args[0]), state.storage.sql, instance as never);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    store.env = { ...store.env, [name]: wrapped };
  });

export const unwrapBuckets = (stub: Ceremony) =>
  runInDurableObject(stub, (instance) => {
    const store = storeOf(instance);
    const real = realEnv.get(store);
    if (real) store.env = real;
    realEnv.delete(store);
  });

export function editQueueSql(sql: SqlStorage, edit: (s: QueueState) => void): void {
  const row = sql.exec<{ json: string }>("SELECT json FROM queue_state").one();
  const s = JSON.parse(row.json) as QueueState;
  edit(s);
  sql.exec("UPDATE queue_state SET json = ?", JSON.stringify(s));
}

export async function clearBuckets(): Promise<void> {
  for (const bucket of [env.PRIVATE, env.PUBLIC]) {
    for (;;) {
      const { objects } = await bucket.list();
      if (objects.length === 0) break;
      await bucket.delete(objects.map((o) => o.key));
    }
  }
}
