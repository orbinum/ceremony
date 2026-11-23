/**
 * One turn as the page drives it: start (claim, heartbeats, the contributions), then end it by
 * signing the attestation or without one. The work is `contribution`'s and `attestation`'s; this
 * hook only keeps their state for React, and the heartbeat until the turn ends.
 */
import type { CircuitName, Receipt } from "@orbinum-ceremony/core";
import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import { attestSession, CLIENT } from "../attestation";
import {
  type Accepted,
  claim,
  computeInWorker,
  contributeAll,
  finish,
  type Heart,
  keepAlive,
  type Progress,
  type SessionApi,
  sleep,
  type Stage,
} from "../contribution";
import { assertLinked, reconnect, type Wallet } from "../wallets";

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

/** Where each circuit of the turn is, with the last thing said about it. */
export type CircuitStages = Partial<Record<CircuitName, { stage: Stage; detail?: string }>>;

/** Where the turn is. */
export type TurnState =
  | { kind: "idle" }
  | { kind: "running"; seq: number; circuits: CircuitStages; paused: boolean }
  | {
      kind: "signing";
      seq: number;
      accepted: Accepted[];
      /** Circuits accepted before this run (a reload mid-turn): their hashes are not known here. */
      earlier: CircuitName[];
      busy: boolean;
      error?: unknown;
    }
  | { kind: "done"; seq: number; attested: boolean; receipt: Receipt | null }
  | { kind: "failed"; error: unknown };

/** The receipt, or null if the session recorded nothing (or it cannot be read now). */
const receiptOf = (seq: number) => api.getReceipt(seq).catch(() => null);

/** `onEnded`: the turn is over (done or failed), so what the page shows of the line is stale. */
export function useTurn(me: api.Me, onEnded: () => void = () => {}) {
  const [state, setState] = useState<TurnState>({ kind: "idle" });
  const heart = useRef<Heart | null>(null);

  // Leaving the page mid-turn loses it: the browser asks first.
  const active = state.kind === "running" || state.kind === "signing";
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  // The heartbeat never outlives the page.
  useEffect(() => () => heart.current?.stop(), []);

  const stopHeart = () => {
    heart.current?.stop();
    heart.current = null;
  };

  /** Ends the turn without an attestation, then shows what it recorded. */
  const end = async (seq: number) => {
    await finish(sessionApi);
    stopHeart();
    setState({ kind: "done", seq, attested: false, receipt: await receiptOf(seq) });
    onEnded();
  };

  /** Claims the turn and contributes to every circuit it offers, with `text` as extra entropy. */
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
      setState({ kind: "running", seq, circuits, paused: false });
      await claim(sessionApi);
      heart.current = keepAlive(sessionApi);
      const csHashes = await api.getCsHashes();
      const current = heart.current;
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
        (p: Progress) =>
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
          ),
      );
      if (accepted.length + earlier.length === 0) {
        await end(seq);
        return;
      }
      setState({ kind: "signing", seq, accepted, earlier, busy: false });
    } catch (error) {
      // The turn is ended whatever failed, so it never lapses as a no-show.
      if (seq !== null) await finish(sessionApi).catch(() => undefined);
      stopHeart();
      setState({ kind: "failed", error });
      onEnded();
    }
  };

  /**
   * Signs the attestation with the linked wallet (`picked`, when the user chose it in the wallet
   * dialog); the coordinator then ends the session.
   */
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

  /** Ends the turn without signing: the contributions count, as unattested. */
  const skip = async () => {
    if (state.kind !== "signing") return;
    setState({ ...state, busy: true });
    await end(state.seq);
  };

  return { state, start, sign, skip, reset: () => setState({ kind: "idle" }) };
}
