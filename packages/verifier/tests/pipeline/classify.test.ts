/** Who is at fault when verification throws (SPEC §2.5): host faults are infra, else the file. */
import { describe, expect, it } from "vitest";
import { IsolationError } from "../../src/isolate";
import { classifyVerifierError } from "../../src/pipeline";

const withCode = (code: unknown, message = String(code)) =>
  Object.assign(new Error(message), { code });

describe("classifyVerifierError", () => {
  it.each([
    "EMFILE",
    "ENFILE",
    "ENOMEM",
    "ENOSPC",
    "EDQUOT",
    "EFBIG",
    "EROFS",
    "EIO",
    "ESTALE",
    "ENOBUFS",
    "EBUSY",
    "EAGAIN",
    "ERR_WORKER_OUT_OF_MEMORY",
    "ERR_WORKER_INIT_FAILED",
  ])("treats code %s as the verifier's problem (infra: pause, nobody penalized)", (code) => {
    expect(classifyVerifierError(withCode(code, "anything"))).toBe("infra");
  });

  it.each(["timeout", "memory", "crashed"] as const)(
    "treats IsolationError(%s) as infra",
    (kind) => {
      expect(classifyVerifierError(new IsolationError(kind, "stopped"))).toBe("infra");
    },
  );

  it.each([
    "EMFILE: too many open files, open 'x.zkey'",
    "ENFILE: file table overflow",
    "ENOMEM: not enough memory, read",
    "ENOSPC: no space left on device, write",
    "EIO: i/o error, read",
    "EDQUOT: disk quota exceeded, write",
    "EFBIG: file too large, write",
    "EROFS: read-only file system, open 'x'",
    "ESTALE: stale file handle, read",
  ])("treats a resource errno message without a code as infra: %s", (message) => {
    expect(classifyVerifierError(new Error(message))).toBe("infra");
  });

  it("treats an out-of-memory or dead worker as infra", () => {
    expect(classifyVerifierError(new Error("JavaScript heap out of memory"))).toBe("infra");
    expect(classifyVerifierError(new Error("Worker terminated due to reaching memory limit"))).toBe(
      "infra",
    );
  });

  it.each([
    "WebAssembly.Memory(): could not allocate memory",
    "WebAssembly.Memory.grow(): Maximum memory size exceeded",
    "WebAssembly.Memory.grow(): Unable to grow instance memory",
    "Cannot allocate Wasm memory for new instance",
    "Array buffer allocation failed",
  ])("treats V8's wasm-memory failure as infra (an address-space limit): %s", (message) => {
    expect(classifyVerifierError(new RangeError(message))).toBe("infra");
  });

  it("blames the upload for anything else snarkjs throws (no pausing at will)", () => {
    expect(classifyVerifierError(new Error("Invalid zkey: section out of bounds"))).toBe(
      "rejected",
    );
    expect(classifyVerifierError(withCode("ENOENT"))).toBe("rejected");
    expect(classifyVerifierError(withCode("EACCES"))).toBe("rejected");
    // An errno only counts as a prefix, not quoted inside a message the file may influence.
    expect(classifyVerifierError(new Error("bad name 'ENOSPC: x'"))).toBe("rejected");
    expect(classifyVerifierError(new Error("EMFILEX"))).toBe("rejected");
  });

  it.each([
    ["a string", "EMFILE"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 5],
    ["an object with a numeric code", { code: 24, message: 1 }],
  ])("blames the upload for a non-Error value (%s)", (_, value) => {
    expect(classifyVerifierError(value)).toBe("rejected");
  });

  it("still reads code and message from an Error-like object", () => {
    expect(classifyVerifierError({ code: "ENOSPC" })).toBe("infra");
    expect(classifyVerifierError({ message: "EIO: i/o error" })).toBe("infra");
  });
});
