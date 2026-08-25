import type { DodecagonIntent } from "@dodecagon/protocol";

export const SHILOH_POLICY = Object.freeze({
  sovereign: false,
  allowedIntents: ["read", "propose"] as const,
  forbiddenIntents: ["execute"] as const,
});

export function assertShilohIntent(intent: DodecagonIntent): void {
  if (intent === "execute") {
    throw new Error("SHILOH_EXECUTION_FORBIDDEN");
  }
}
