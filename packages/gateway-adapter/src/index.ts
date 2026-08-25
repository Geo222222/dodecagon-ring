import { randomUUID } from "node:crypto";
import type {
  CallerId,
  DodecagonEnvelope,
  DodecagonIntent,
  GateId,
  GateResponse,
} from "@dodecagon/protocol";
import { validateEnvelope, verifyEnvelopeSignature } from "@dodecagon/protocol";
import { authorizeEnvelope } from "@dodecagon/ring-core";

export type CapabilityHandler = (envelope: DodecagonEnvelope) => Promise<unknown>;

export interface GateCapability {
  intents: readonly DodecagonIntent[];
  callers: readonly CallerId[];
  handler: CapabilityHandler;
}

export interface GatewayAuditEvent {
  eventId: string;
  occurredAt: string;
  eventType: "gateway.accepted";
  gate: GateId;
  requestId: string;
  caller: CallerId;
  targetGate: GateId;
  intent: DodecagonIntent;
  capability: string;
}

export interface GatewaySecurity {
  maxClockSkewMs: number;
  now?: () => number;
  consumeNonce: (envelope: DodecagonEnvelope, expiresAt: string) => Promise<boolean>;
  recordAudit: (event: GatewayAuditEvent) => Promise<void>;
}

export interface GatewayAdapterConfig {
  gateId: GateId;
  capabilities: Readonly<Record<string, GateCapability>>;
  resolveCallerPublicKey: (caller: CallerId) => string | undefined;
  security: GatewaySecurity;
}

export function createGatewayAdapter(config: GatewayAdapterConfig) {
  const maxClockSkewMs = validateClockSkew(config.security.maxClockSkewMs);

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

    const nowMs = config.security.now?.() ?? Date.now();
    const requestMs = Date.parse(envelope.timestamp);
    if (Math.abs(nowMs - requestMs) > maxClockSkewMs) {
      return failure(
        config.gateId,
        envelope.requestId,
        "REQUEST_OUTSIDE_TIME_WINDOW",
        "Signed request timestamp is outside the permitted gateway tolerance.",
      );
    }

    const ringDecision = authorizeEnvelope(envelope);
    if (!ringDecision.allowed) {
      return failure(config.gateId, envelope.requestId, ringDecision.code, ringDecision.reason);
    }

    const capability = config.capabilities[envelope.capability];
    if (capability === undefined) {
      return failure(config.gateId, envelope.requestId, "UNKNOWN_CAPABILITY", "Target Gate does not expose this capability.");
    }

    if (!capability.intents.includes(envelope.intent)) {
      return failure(
        config.gateId,
        envelope.requestId,
        "INTENT_CAPABILITY_MISMATCH",
        "Declared request intent is not valid for this capability.",
      );
    }

    if (!capability.callers.includes(envelope.caller)) {
      return failure(
        config.gateId,
        envelope.requestId,
        "CALLER_NOT_AUTHORIZED",
        "Authenticated caller is not authorized for this capability.",
      );
    }

    const expiresAt = new Date(Math.max(nowMs, requestMs) + maxClockSkewMs).toISOString();
    try {
      const accepted = await config.security.consumeNonce(envelope, expiresAt);
      if (!accepted) {
        return failure(
          config.gateId,
          envelope.requestId,
          "REPLAY_DETECTED",
          "This caller nonce has already crossed the Ring boundary.",
        );
      }
    } catch (error) {
      return failure(config.gateId, envelope.requestId, "SECURITY_GUARD_FAILURE", errorMessage(error));
    }

    try {
      await config.security.recordAudit({
        eventId: randomUUID(),
        occurredAt: new Date(nowMs).toISOString(),
        eventType: "gateway.accepted",
        gate: config.gateId,
        requestId: envelope.requestId,
        caller: envelope.caller,
        targetGate: envelope.targetGate,
        intent: envelope.intent,
        capability: envelope.capability,
      });
    } catch (error) {
      return failure(config.gateId, envelope.requestId, "AUDIT_UNAVAILABLE", errorMessage(error));
    }

    try {
      const data = await capability.handler(envelope);
      return { ok: true, gate: config.gateId, requestId: envelope.requestId, data };
    } catch (error) {
      return failure(config.gateId, envelope.requestId, "HANDLER_FAILURE", errorMessage(error));
    }
  };
}

function validateClockSkew(value: number): number {
  if (!Number.isFinite(value) || value < 1_000 || value > 300_000) {
    throw new RangeError("Gateway maxClockSkewMs must be between 1000 and 300000 milliseconds.");
  }
  return Math.floor(value);
}

function failure(gate: GateId, requestId: string, code: string, message: string): GateResponse {
  return { ok: false, gate, requestId, error: { code, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
