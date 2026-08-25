import { describe, expect, it } from "vitest";
import type { DodecagonEnvelope } from "@dodecagon/protocol";
import { authorizeEnvelope } from "../src/index.js";

const base: DodecagonEnvelope = {
  protocol: "dodecagon/1",
  requestId: "request-0001",
  timestamp: "2026-08-25T16:00:00.000Z",
  nonce: "nonce-0001",
  caller: "shiloh",
  targetGate: "judah",
  intent: "read",
  capability: "governance.policy.read",
  body: {},
  signature: "signature-placeholder",
};

describe("Ring authority", () => {
  it("allows Shiloh to read", () => {
    expect(authorizeEnvelope(base).allowed).toBe(true);
  });

  it("allows Shiloh to propose", () => {
    expect(authorizeEnvelope({ ...base, intent: "propose" }).allowed).toBe(true);
  });

  it("denies Shiloh execution deterministically", () => {
    const result = authorizeEnvelope({ ...base, intent: "execute" });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("SHILOH_EXECUTION_FORBIDDEN");
  });
});
