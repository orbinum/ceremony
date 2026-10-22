/** The ceremony's object as tests drive it: links, state edits, the transcript and its buckets. */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { Chained, LinkPayload, QueueState } from "@orbinum-ceremony/core";
import { type BaseWallet, Wallet } from "ethers";
import { signLinkEvm } from "./wallets";

/** The stub of a ceremony object. */
export type Ceremony = ReturnType<typeof env.CEREMONY.getByName>;

/** The object of ceremony `id`. */
export const stubOf = (id: string): Ceremony => env.CEREMONY.getByName(id);

/**
 * Links a wallet straight in the Durable Object, signed as a wallet signs its link (the Worker
 * verifies signatures before it ever calls `link`), for tests about the queue rather than the
 * link route. Returns the wallet.
 */
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

/** The object's transcript (RPC types the attestation payload as `never`, so cast). */
export const readTranscript = async (stub: Ceremony) =>
  (await stub.transcript()) as unknown as { chainGenesis: string; records: Chained[] };

/** Edits the persisted queue state, as if time had passed or a deadline were reached. */
export const setQueue = (stub: Ceremony, edit: (s: QueueState) => void) =>
  runInDurableObject(stub, (_, state) => {
    const row = state.storage.sql.exec<{ json: string }>("SELECT json FROM queue_state").one();
    const s = JSON.parse(row.json) as QueueState;
    edit(s);
    state.storage.sql.exec("UPDATE queue_state SET json = ?", JSON.stringify(s));
  });

/** Moves the slot's clock fields back, as if `ms` had passed. */
export const rewind = (stub: Ceremony, ms: number) =>
  setQueue(stub, (s) => {
    if (!s.slot) return;
    s.slot.grantedAt -= ms;
    s.slot.lastHeartbeat -= ms;
    if (s.slot.runningSince !== null) s.slot.runningSince -= ms;
  });

/** Expires every link nonce. */
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

/** Each wrapped store's real bindings. */
const realEnv = new WeakMap<object, Env>();
const storeOf = (instance: unknown) => (instance as { store: { env: Env } }).store;

/**
 * Wraps one of the object's buckets: `hook` runs before every call (it may throw, to fail it, or
 * edit the object's SQLite or call the object itself, as if something happened meanwhile).
 * `unwrapBuckets` restores them.
 */
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
          await hook(String(prop), args[0], state.storage.sql, instance as never);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    store.env = { ...store.env, [name]: wrapped };
  });

/** Restores the object's real buckets. */
export const unwrapBuckets = (stub: Ceremony) =>
  runInDurableObject(stub, (instance) => {
    const store = storeOf(instance);
    const real = realEnv.get(store);
    if (real) store.env = real;
    realEnv.delete(store);
  });

/** Edits a queue state through the object's own SQLite (from inside a bucket hook). */
export function editQueueSql(sql: SqlStorage, edit: (s: QueueState) => void): void {
  const row = sql.exec<{ json: string }>("SELECT json FROM queue_state").one();
  const s = JSON.parse(row.json) as QueueState;
  edit(s);
  sql.exec("UPDATE queue_state SET json = ?", JSON.stringify(s));
}

/** Empties both buckets (they are shared by every object of a test file). */
export async function clearBuckets(): Promise<void> {
  for (const bucket of [env.PRIVATE, env.PUBLIC]) {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- a few listings
      const { objects } = await bucket.list();
      if (objects.length === 0) break;
      // oxlint-disable-next-line no-await-in-loop -- a few deletes
      await bucket.delete(objects.map((o) => o.key));
    }
  }
}
