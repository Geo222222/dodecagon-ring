import type { DodecagonEnvelope } from "@dodecagon/protocol";

export interface AuthorizationDecision {
  allowed: boolean;
  code: "ALLOW" | "SHILOH_EXECUTION_FORBIDDEN";
  reason: string;
}

export function authorizeEnvelope(envelope: DodecagonEnvelope): AuthorizationDecision {
  if (envelope.caller === "shiloh" && envelope.intent === "execute") {
    return {
      allowed: false,
      code: "SHILOH_EXECUTION_FORBIDDEN",
      reason: "Shiloh is a non-sovereign courtyard engine and cannot execute Gate state changes.",
    };
  }

  return {
    allowed: true,
    code: "ALLOW",
    reason: "Envelope passes Ring-level authority ceiling. Target Gate policy still applies.",
  };
}
