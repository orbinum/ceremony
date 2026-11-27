/**
 * The caller's linked wallet as the client shows it, with why it cannot be changed now (null: it
 * can be).
 */
import { ceremony } from "../../durable";
import type { Caller } from "../types";

export async function linkedWallet(env: Env, caller: Caller) {
  const stub = ceremony(env);
  const [linked, changeRefusal] = await Promise.all([
    stub.linked(caller.githubId),
    stub.changeRefusal(caller.githubId),
  ]);
  return {
    ceremonyId: env.CEREMONY_ID,
    githubId: caller.githubId,
    login: caller.login,
    linked: linked && {
      scheme: linked.scheme,
      account: linked.account,
      linkedAt: linked.linkedAt,
      changeRefusal,
    },
  };
}
