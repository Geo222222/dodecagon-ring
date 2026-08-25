import { generateKeyPairSync, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signEnvelope, type DodecagonEnvelope } from "@dodecagon/protocol";
import { createGatewayAdapter } from "../src/index.js";

const keys = generateKeyPairSync("ed25519");
const privateKey = keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();

function envelope(intent: DodecagonEnvelope["intent"], capability: string) {
  return signEnvelope(
    {
      protocol: "dodecagon/1",
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
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

describe("Gateway adapter", () => {
  const adapter = createGatewayAdapter({
    gateId: "reuben",
    resolveCallerPublicKey: () => publicKey,
    capabilities: {
      "foundation.logs.read": {
        intents: ["read"],
        callers: ["shiloh"],
        handler: () => ({ entries: [] }),
      },
      "foundation.state.execute": {
        intents: ["execute"],
        callers: ["root-authority"],
        handler: () => ({ changed: true }),
      },
    },
  });

  it("permits an authorized Shiloh read", async () => {
    const result = await adapter(envelope("read", "foundation.logs.read"));
    expect(result.ok).toBe(true);
  });

  it("rejects Shiloh execute before the handler", async () => {
    const result = await adapter(envelope("execute", "foundation.state.execute"));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("SHILOH_EXECUTION_FORBIDDEN");
  });

  it("rejects a mislabeled read request aimed at an execute capability", async () => {
    const result = await adapter(envelope("read", "foundation.state.execute"));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INTENT_CAPABILITY_MISMATCH");
  });
});
