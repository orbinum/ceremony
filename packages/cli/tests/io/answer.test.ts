/** The coordinator's answers: refusals with their code, JSON objects only, every byte bounded. */
import { describe, expect, it } from "vitest";
import { answerOf, CoordinatorRefusal } from "../../src/io/answer";

const json = (status: number, body: unknown, type = "application/json") =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": type },
  });

describe("answerOf", () => {
  it("takes a 2xx JSON object", async () => {
    expect(await answerOf(json(200, { ok: true }), "GET /x")).toEqual({ ok: true });
  });

  it("turns any other answer into a refusal with core's code, terminal-safe", async () => {
    const error = await answerOf(
      json(409, { error: { code: "busy", message: "\u001b[2Jcleared" } }),
      "POST /x",
    ).catch((e: unknown) => e as CoordinatorRefusal);
    expect(error).toBeInstanceOf(CoordinatorRefusal);
    expect([error.status, error.code]).toEqual([409, "busy"]);
    expect(error.message).not.toContain("\u001b");
    const plain = await answerOf(json(502, "bad gateway", "text/html"), "GET /x").catch(
      (e: unknown) => e as CoordinatorRefusal,
    );
    expect([plain.status, plain.code]).toEqual([502, undefined]);
  });

  it("refuses a 2xx that is not JSON (a login page) and an oversized answer", async () => {
    await expect(
      answerOf(json(200, "<html>", "text/html"), "GET /x", "a login page?"),
    ).rejects.toThrow("GET /x: 200 but a login page?");
    await expect(answerOf(json(200, "x".repeat(65 * 1024)), "GET /x")).rejects.toThrow(
      /larger than/,
    );
    await expect(answerOf(json(200, [1, 2]), "GET /x")).rejects.toThrow(/expected an object/);
  });
});
