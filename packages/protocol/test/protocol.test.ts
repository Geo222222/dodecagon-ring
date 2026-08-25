import { generateKeyPairSync, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GATE_IDS, signEnvelope, validateEnvelope, verifyEnvelopeSignature } from "../src/index.js";

describe("dodecagon protocol", () => {
  it("has exactly twelve sovereign gate identifiers", () => {
    expect(new Set(GATE_IDS).size).toBe(12);
    expect(GATE_IDS).toHaveLength(12);
  });

  it("round-trips an Ed25519 signed envelope", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const envelope = signEnvelope(
      {
        protocol: "dodecagon/1",
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
        nonce: randomUUID(),
        caller: "shiloh",
        targetGate: "reuben",
        intent: "read",
        capability: "foundation.logs.read",
        body: {},
      },
      privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    );

    expect(validateEnvelope(envelope)).toEqual(envelope);
    expect(
      verifyEnvelopeSignature(
        envelope,
        publicKey.export({ format: "pem", type: "spki" }).toString(),
      ),
    ).toBe(true);
  });
});
