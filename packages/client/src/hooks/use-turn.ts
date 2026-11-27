/**
 * One turn as the page drives it: `start` claims it, keeps it with heartbeats and contributes to
 * every circuit it offers (with the user's text as extra entropy); then `sign` attests with the
 * linked wallet (`picked` when the user chose it in the wallet dialog), or `skip` ends it without
 * signing, the contributions still counting as unattested. The work is `contribution`'s and
 * `attestation`'s; this hook keeps their state for React and the heartbeat until the turn ends,
 * never beyond the page. Leaving the page mid-turn loses it, so the browser asks first. Whatever
 * fails, the turn is ended so it never lapses as a no-show. Circuits accepted in this session but
 * not by this run (an upload made before a reload) are signed by name. `onEnded`: the turn is over
 * (done or failed), so what the page shows of the line is stale. The receipt shown is null if the
 * session recorded nothing or it cannot be read now.
 */
import type { CircuitName } from "@orbinum-ceremony/core";
import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import { attestSession, CLIENT } from "../attestation";
import {
  claim,
  computeInWorker,
  contributeAll,
  finish,
  type Heart,
  keepAlive,
  type Progress,
  type SessionApi,
  sleep,
} from "../contribution";
import { assertLinked, reconnect, type Wallet } from "../wallets";
import type { CircuitStages, TurnState } from "./types";

const sessionApi: SessionApi = {
  getSlot: api.getSlot,
  claimTurn: api.claimTurn,
  heartbeat: api.heartbeat,
  finishSession: api.finishSession,
  getHead: api.getHead,
  download: api.download,
  uploadContribution: api.uploadContribution,
  getResult: api.getResult,
};

const receiptOf = (seq: number) => api.getReceipt(seq).catch(() => null);

export function useTurn(me: api.Me, onEnded: () => void = () => {}) {
  const [state, setState] = useState<TurnState>({ kind: "idle" });
  const heart = useRef<Heart | null>(null);

  const active = state.kind === "running" || state.kind === "signing";
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  useEffect(() => () => heart.current?.stop(), []);

  const stopHeart = () => {
    heart.current?.stop();
    heart.current = null;
  };

  const end = async (seq: number) => {
    await finish(sessionApi);
    stopHeart();
    setState({ kind: "done", seq, attested: false, receipt: await receiptOf(seq) });
    onEnded();
  };

  const start = async (text: string) => {
    let seq: number | null = null;
    try {
      const view = await api.getSlot();
      if (!view.slot) throw new Error("It is not your turn yet");
      seq = view.slot.seq;
      const earlier = view.slot.circuits
        .filter((c) => c.status === "accepted")
        .map((c) => c.circuit);
      const circuits: CircuitStages = {};
      for (const c of view.slot.circuits) {
        if (c.status === "accepted") circuits[c.circuit] = { stage: "accepted" };
      }
      const order = view.slot.circuits.map((c) => c.circuit);
      setState({ kind: "running", seq, order, circuits, paused: false });
      await claim(sessionApi);
      heart.current = keepAlive(sessionApi);
      const csHashes = await api.getCsHashes();
      const current = heart.current;
      const reported = new Set<CircuitName>();
      const accepted = await contributeAll(
        {
          api: sessionApi,
          compute: computeInWorker,
          csHashes,
          client: CLIENT,
          text,
          lost: () => current.lost(),
          sleep,
        },
        seq,
        (p: Progress) => {
          if (p.circuit !== null && p.stage === "accepted") reported.add(p.circuit);
          setState((s) =>
            s.kind !== "running"
              ? s
              : p.circuit === null
                ? { ...s, paused: true }
                : {
                    ...s,
                    paused: false,
                    circuits: { ...s.circuits, [p.circuit]: { stage: p.stage, detail: p.detail } },
                  },
          );
        },
      );
      for (const c of reported) {
        if (!earlier.includes(c) && !accepted.some((a) => a.circuit === c)) earlier.push(c);
      }
      if (accepted.length + earlier.length === 0) {
        await end(seq);
        return;
      }
      setState({ kind: "signing", seq, accepted, earlier, busy: false });
    } catch (error) {
      if (seq !== null) await finish(sessionApi).catch(() => undefined);
      stopHeart();
      setState({ kind: "failed", error });
      onEnded();
    }
  };

  const sign = async (picked?: Wallet) => {
    if (state.kind !== "signing" || !me.linked) return;
    const { seq, accepted, earlier } = state;
    setState({ ...state, busy: true, error: undefined });
    try {
      const wallet = picked ? assertLinked(picked, me.linked) : await reconnect(me.linked);
      await attestSession(api, me, wallet, seq, CLIENT, {
        accepted: accepted.map((a) => ({
          circuit: a.circuit,
          index: a.index,
          input_sha256: a.inputSha256,
          output_sha256: a.outputSha256,
          contribution_hash: a.contributionHash,
        })),
        earlier,
      });
      stopHeart();
      setState({ kind: "done", seq, attested: true, receipt: await receiptOf(seq) });
      onEnded();
    } catch (error) {
      setState({ ...state, busy: false, error });
    }
  };

  const skip = async () => {
    if (state.kind !== "signing") return;
    setState({ ...state, busy: true });
    await end(state.seq);
  };

  return { state, start, sign, skip, reset: () => setState({ kind: "idle" }) };
}
