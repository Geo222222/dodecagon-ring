import { createHash, randomUUID } from "node:crypto";
import { canonicalJson, type GateId } from "@dodecagon/protocol";
import { callGate } from "./client.js";

export interface EvidenceReference {
  sourceGate: GateId;
  capability: string;
  requestId: string;
  observedAt: string;
  digestSha256: string;
}

export interface ProposalProvenance {
  engine: "shiloh";
  createdAt: string;
  evidence: readonly EvidenceReference[];
  reasoningArtifactDigest?: string;
}

export interface ShilohProposal {
  proposalId: string;
  createdAt: string;
  targetGate: GateId;
  requestedCapability: string;
  thesis: string;
  proposal: unknown;
  evidence: readonly EvidenceReference[];
  provenance: ProposalProvenance;
}

export function evidenceFromObservation(input: {
  sourceGate: GateId;
  capability: string;
  requestId: string;
  observedAt?: string;
  data: unknown;
}): EvidenceReference {
  return {
    sourceGate: input.sourceGate,
    capability: input.capability,
    requestId: input.requestId,
    observedAt: input.observedAt ?? new Date().toISOString(),
    digestSha256: sha256(canonicalJson(input.data)),
  };
}

export function buildProposal(input: {
  targetGate: GateId;
  requestedCapability: string;
  thesis: string;
  proposal: unknown;
  evidence: readonly EvidenceReference[];
  reasoningArtifact?: unknown;
  createdAt?: string;
}): ShilohProposal {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const provenance: ProposalProvenance = {
    engine: "shiloh",
    createdAt,
    evidence: input.evidence,
    ...(input.reasoningArtifact === undefined
      ? {}
      : { reasoningArtifactDigest: sha256(canonicalJson(input.reasoningArtifact)) }),
  };
  return {
    proposalId: randomUUID(),
    createdAt,
    targetGate: input.targetGate,
    requestedCapability: input.requestedCapability,
    thesis: input.thesis,
    proposal: input.proposal,
    evidence: input.evidence,
    provenance,
  };
}

export function recordProposal(input: {
  reubenBaseUrl: string;
  privateKeyPem: string;
  proposal: ShilohProposal;
}): Promise<unknown> {
  return callGate({
    baseUrl: input.reubenBaseUrl,
    targetGate: "reuben",
    intent: "propose",
    capability: "foundation.proposals.append",
    body: input.proposal,
    privateKeyPem: input.privateKeyPem,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
