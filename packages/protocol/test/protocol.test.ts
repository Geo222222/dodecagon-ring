import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GATE_IDS,
  canonicalJson,
  isRootApprovalCurrentlyValid,
  rootApprovalPayload,
  signEnvelope,
  verifyEnvelopeSignature,
  verifyRootApprovalSignature,
  type RootApprovalManifest,
} from "../src/index.js";

const keys = generateKeyPairSync("ed25519");
const privateKey = keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();

describe("Dodecagon protocol", () => {
  it("defines exactly twelve sovereign Gate identifiers", () => {
    expect(GATE_IDS).toHaveLength(12);
    expect(new Set(GATE_IDS).size).toBe(12);
  });

  it("signs and verifies a canonical envelope", () => {
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
        body: { z: 2, a: 1 },
      },
      privateKey,
    );

    expect(verifyEnvelopeSignature(envelope, publicKey)).toBe(true);
    expect(canonicalJson({ z: 2, a: 1 })).toBe('{"a":1,"z":2}');
  });

  it("verifies a current detached Root Authority approval", () => {
    const now = Date.now();
    const manifest: RootApprovalManifest = {
      protocol: "dodecagon/root-approval/1",
      approvalId: randomUUID(),
      repository: "Geo222222/dodecagon-ring",
      commitSha: "a".repeat(40),
      operation: "deploy:ring-m2",
      issuedAt: new Date(now - 1_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
    };
    const signature = sign(null, Buffer.from(rootApprovalPayload(manifest), "utf8"), keys.privateKey).toString("base64");

    expect(verifyRootApprovalSignature(manifest, signature, publicKey)).toBe(true);
    expect(isRootApprovalCurrentlyValid(manifest, now)).toBe(true);
  });

  it("rejects an expired Root Authority approval window", () => {
    const now = Date.now();
    const manifest: RootApprovalManifest = {
      protocol: "dodecagon/root-approval/1",
      approvalId: randomUUID(),
      repository: "Geo222222/dodecagon-ring",
      commitSha: "b".repeat(40),
      operation: "deploy:ring-m2",
      issuedAt: new Date(now - 120_000).toISOString(),
      expiresAt: new Date(now - 60_000).toISOString(),
    };

    expect(isRootApprovalCurrentlyValid(manifest, now)).toBe(false);
  });
});
