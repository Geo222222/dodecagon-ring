import { describe, expect, it } from "vitest";
import { computeRingEventHash, type RingEventInput } from "../src/store.js";

const event: RingEventInput = {
  eventId: "11111111-1111-4111-8111-111111111111",
  occurredAt: "2026-08-25T17:00:00.000Z",
  source: "reuben",
  eventType: "gateway.accepted",
  payload: { requestId: "request-1", caller: "shiloh" },
};

describe("Reuben hash-chain primitive", () => {
  it("is deterministic for the same event and predecessor", () => {
    expect(computeRingEventHash(event, null)).toBe(computeRingEventHash(event, null));
  });

  it("changes when the predecessor changes", () => {
    expect(computeRingEventHash(event, null)).not.toBe(computeRingEventHash(event, "a".repeat(64)));
  });

  it("changes when event payload changes", () => {
    expect(computeRingEventHash(event, null)).not.toBe(
      computeRingEventHash({ ...event, payload: { requestId: "request-2", caller: "shiloh" } }, null),
    );
  });
});
