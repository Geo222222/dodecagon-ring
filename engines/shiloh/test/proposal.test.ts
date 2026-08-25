import { describe, expect, it } from "vitest";
import { buildProposal, evidenceFromObservation } from "../src/proposal.js";

describe("Shiloh evidence and proposal provenance", () => {
  it("produces deterministic evidence digests", () => {
    const first = evidenceFromObservation({
      sourceGate: "reuben",
      capability: "foundation.logs.read",
      requestId: "request-123",
      observedAt: "2026-08-25T17:00:00.000Z",
      data: { b: 2, a: 1 },
    });
    const second = evidenceFromObservation({
      sourceGate: "reuben",
      capability: "foundation.logs.read",
      requestId: "request-123",
      observedAt: "2026-08-25T17:00:00.000Z",
      data: { a: 1, b: 2 },
    });
    expect(first.digestSha256).toBe(second.digestSha256);
  });

  it("builds proposals with Shiloh provenance but no execution authority field", () => {
    const evidence = evidenceFromObservation({
      sourceGate: "reuben",
      capability: "foundation.logs.read",
      requestId: "request-456",
      observedAt: "2026-08-25T17:00:00.000Z",
      data: { status: "ready" },
    });
    const proposal = buildProposal({
      targetGate: "judah",
      requestedCapability: "governance.policy.propose",
      thesis: "A policy amendment should be reviewed.",
      proposal: { amendment: "example" },
      evidence: [evidence],
      createdAt: "2026-08-25T17:00:01.000Z",
    });
    expect(proposal.provenance.engine).toBe("shiloh");
    expect("execute" in proposal).toBe(false);
  });
});
