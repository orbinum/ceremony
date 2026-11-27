/** A mirror's transcript may only extend the local one: never drop records, fork or lose finals. */
import type { Transcript } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import { rollback } from "../../../src/commands/download/rollback";

const transcript = (chains: string[], finals: unknown[] = []) =>
  ({ records: chains.map((chain) => ({ chain })), finals }) as unknown as Transcript;

describe("rollback", () => {
  it("lets a transcript extend the local one", () => {
    expect(rollback(transcript(["a", "b"]), transcript(["a", "b", "c"]))).toEqual([]);
  });

  it("names every way the new one would roll the local one back", () => {
    expect(rollback(transcript(["a", "b"]), transcript(["a"]))).toEqual(["1 records, 2 here"]);
    expect(rollback(transcript(["a", "b"]), transcript(["a", "x"]))).toEqual([
      "does not extend the local chain",
    ]);
    expect(
      rollback(transcript(["a"], [{ circuit: "shield" }]), transcript(["a", "b"], [])),
    ).toEqual(["drops or changes the local finals"]);
  });
});
