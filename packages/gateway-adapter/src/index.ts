import type { CallerId, DodecagonEnvelope, GateId, GateResponse } from "@dodecagon/protocol";
import { validateEnvelope, verifyEnvelopeSignature } from "@dodecagon/protocol";
import { authorizeEnvelope } from "@dodecagon/ring-core";

export type CapabilityHandler = (envelope: DodecagonEnvelope) => Promise<unknown>;

export interface GatewayAdapterConfig {
  gateId: GateId;
  capabilities: Readonly<Record<string, CapabilityHandler>>;
  resolveCallerPublicKey: (caller: CallerId) => string | undefined;
}

export function createGatewayAdapter(config: GatewayAdapterConfig) {
  return async (input: unknown): Promise<GateResponse> => {
    let envelope: DodecagonEnvelope;
    try {
      envelope = validateEnvelope(input);
    } catch (error) {
      return failure(config.gateId, "unknown", "INVALID_ENVELOPE", errorMessage(error));
    }

    if (envelope.targetGate !== config.gateId) {
      return failure(config.gateId, envelope.requestId, "WRONG_GATE", "Envelope target does not match this Gate.");
    }

    const publicKey = config.resolveCallerPublicKey(envelope.caller);
    if (publicKey === undefined || !verifyEnvelopeSignature(envelope, publicKey)) {
      return failure(config.gateId, envelope.requestId, "UNTRUSTED_CALLER", "Caller signature is not trusted.");
    }

    const ringDecision = authorizeEnvelope(envelope);
    if (!ringDecision.allowed) {
      return failure(config.gateId, envelope.requestId, ringDecision.code, ringDecision.reason);
    }

    const handler = config.capabilities[envelope.capability];
    if (handler === undefined) {
      return failure(config.gateId, envelope.requestId, "UNKNOWN_CAPABILITY", "Target Gate does not expose this capability.");
    }

    try {
      const data = await handler(envelope);
      return { ok: true, gate: config.gateId, requestId: envelope.requestId, data };
    } catch (error) {
      return failure(config.gateId, envelope.requestId, "HANDLER_FAILURE", errorMessage(error));
    }
  };
}

function failure(gate: GateId, requestId: string, code: string, message: string): GateResponse {
  return { ok: false, gate, requestId, error: { code, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
