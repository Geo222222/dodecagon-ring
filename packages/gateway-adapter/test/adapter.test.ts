import { generateKeyPairSync, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signEnvelope, type DodecagonEnvelope } from "@dodecagon/protocol";
import { createGatewayAdapter, type GatewayAuditEvent } from "../src/index.js";

const keys = generateKeyPairSync("ed25519");
const privateKey = keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
const fixedNow = Date.parse("2026-08-25T17:00:00.000Z");

function envelope(intent: DodecagonEnvelope["intent"], capability: string, timestamp = new Date(fixedNow).toISOString()) {
  return signEnvelope(
    {
      protocol: "dodecagon/1",
      requestId: randomUUID(),
      timestamp,
      nonce: randomUUID(),
      caller: "shiloh",
      targetGate: "reuben",
      intent,
      capability,
      body: {},
    },
    privateKey,
  );
}

function buildAdapter() {
  const seen = new Set<string>();
  const audit: GatewayAuditEvent[] = [];
  let handlerCalls = 0;
  const adapter = createGatewayAdapter({
    gateId: "reuben",
    resolveCallerPublicKey: () => publicKey,
    security: {
      maxClockSkewMs: 60_000,
      now: () => fixedNow,
      consumeNonce: (request) => {
        const key = `${request.caller}:${request.nonce}`;
        if (seen.has(key)) return Promise.resolve(false);
        seen.add(key);
        return Promise.resolve(true);
      },
      recordAudit: (event) => {
        audit.push(event);
        return Promise.resolve();
      },
    },
    capabilities: {
      "foundation.logs.read": {
        intents: ["read"],
        callers: ["shiloh"],
        handler: () => {
          handlerCalls += 1;
          return Promise.resolve({ entries: [] });
        },
      },
      "foundation.state.execute": {
        intents: ["execute"],
        callers: ["root-authority"],
        handler: () => Promise.resolve({ changed: true }),
      },
    },
  });
  return { adapter, audit, getHandlerCalls: () => handlerCalls };
}

describe("Gateway adapter", () => {
  it("permits an authorized Shiloh read and persists the acceptance decision", async () => {
    const { adapter, audit } = buildAdapter();
    const result = await adapter(envelope("read", "foundation.logs.read"));
    expect(result.ok).toBe(true);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.eventType).toBe("gateway.accepted");
  });

  it("rejects Shiloh execute before the handler", async () => {
    const { adapter } = buildAdapter();
    const result = await adapter(envelope("execute", "foundation.state.execute"));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("SHILOH_EXECUTION_FORBIDDEN");
  });

  it("rejects a mislabeled read request aimed at an execute capability", async () => {
    const { adapter } = buildAdapter();
    const result = await adapter(envelope("read", "foundation.state.execute"));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INTENT_CAPABILITY_MISMATCH");
  });

  it("drops signed requests outside the timestamp tolerance", async () => {
    const { adapter } = buildAdapter();
    const stale = new Date(fixedNow - 60_001).toISOString();
    const result = await adapter(envelope("read", "foundation.logs.read", stale));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("REQUEST_OUTSIDE_TIME_WINDOW");
  });

  it("consumes a nonce exactly once and blocks replay before a second handler call", async () => {
    const { adapter, getHandlerCalls } = buildAdapter();
    const signed = envelope("read", "foundation.logs.read");
    const first = await adapter(signed);
    const second = await adapter(signed);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("REPLAY_DETECTED");
    expect(getHandlerCalls()).toBe(1);
  });
});
