import { randomUUID } from "node:crypto";
import type { DodecagonIntent, GateId } from "@dodecagon/protocol";
import { signEnvelope } from "@dodecagon/protocol";
import { assertShilohIntent } from "./policy.js";

export async function callGate(input: {
  baseUrl: string;
  targetGate: GateId;
  intent: Exclude<DodecagonIntent, "execute">;
  capability: string;
  body: unknown;
  privateKeyPem: string;
}): Promise<unknown> {
  assertShilohIntent(input.intent);

  const envelope = signEnvelope(
    {
      protocol: "dodecagon/1",
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      nonce: randomUUID(),
      caller: "shiloh",
      targetGate: input.targetGate,
      intent: input.intent,
      capability: input.capability,
      body: input.body,
    },
    input.privateKeyPem,
  );

  const response = await fetch(`${input.baseUrl}/v1/gateway`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });

  if (!response.ok) {
    throw new Error(`Gate call failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}
