import { startGateServer, type GatewaySecurity } from "@dodecagon/gate-runtime";
import { GATE_IDS, isGateId, validateRootApprovalManifest, type CallerId } from "@dodecagon/protocol";
import { ReubenStore, type ProposalInput, type RingEventInput } from "./store.js";

const databaseUrl = requiredEnv("DATABASE_URL");
const store = new ReubenStore(databaseUrl);
const maxClockSkewMs = parseClockSkew(process.env["DODECAGON_MAX_CLOCK_SKEW_MS"] ?? "60000");
const gateCallers: readonly CallerId[] = GATE_IDS;

const security: GatewaySecurity = {
  maxClockSkewMs,
  consumeNonce: (envelope, expiresAt) => store.consumeNonce(envelope.caller, envelope.nonce, expiresAt),
  recordAudit: async (event) => {
    await store.appendEvent({
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      source: event.gate,
      eventType: event.eventType,
      payload: {
        gate: event.gate,
        requestId: event.requestId,
        caller: event.caller,
        targetGate: event.targetGate,
        intent: event.intent,
        capability: event.capability,
      },
    });
  },
};

startGateServer({
  gateId: "reuben",
  port: Number(process.env["PORT"] ?? 4101),
  security,
  capabilities: {
    "foundation.health.read": {
      intents: ["read"],
      callers: ["shiloh", "judah", "root-authority"],
      handler: () => Promise.resolve({ status: "ready", sovereign: true, persistence: "postgresql" }),
    },
    "foundation.logs.read": {
      intents: ["read"],
      callers: ["shiloh", "judah", "root-authority"],
      handler: async (envelope) => ({ entries: await store.listEvents(readLimit(envelope.body)) }),
    },
    "foundation.audit.verify": {
      intents: ["read"],
      callers: ["shiloh", "judah", "root-authority"],
      handler: async () => store.verifyChain(),
    },
    "foundation.nonce.consume": {
      intents: ["execute"],
      callers: gateCallers,
      handler: async (envelope) => {
        const body = readNonceBody(envelope.body);
        if (body.targetGate !== envelope.caller) throw new Error("NONCE_SCOPE_MISMATCH");
        return { accepted: await store.consumeNonce(body.caller, body.nonce, body.expiresAt) };
      },
    },
    "foundation.audit.append": {
      intents: ["execute"],
      callers: gateCallers,
      handler: async (envelope) => {
        const body = readAuditBody(envelope.body, envelope.caller);
        const event = await store.appendEvent(body);
        return { eventId: event.eventId, sequence: event.sequence, eventHash: event.eventHash };
      },
    },
    "foundation.root-approval.consume": {
      intents: ["execute"],
      callers: ["external:github-actions"],
      handler: async (envelope) => {
        const body = readRootApprovalBody(envelope.body);
        const expectedRepository = process.env["DODECAGON_REPOSITORY"] ?? "Geo222222/dodecagon-ring";
        if (body.manifest.repository !== expectedRepository) throw new Error("ROOT_APPROVAL_REPOSITORY_MISMATCH");
        const accepted = await store.consumeRootApproval({
          manifest: body.manifest,
          signatureBase64: body.signatureBase64,
          rootPublicKeyPem: requiredEnv("ROOT_AUTHORITY_PUBLIC_KEY_PEM"),
          consumerRequestId: envelope.requestId,
        });
        return { accepted, approvalId: body.manifest.approvalId };
      },
    },
    "foundation.proposals.append": {
      intents: ["propose"],
      callers: ["shiloh"],
      handler: async (envelope) => {
        const proposal = readProposal(envelope.body);
        await store.recordProposal(proposal);
        return { recorded: true, proposalId: proposal.proposalId };
      },
    },
  },
});

function readLimit(body: unknown): number {
  if (typeof body !== "object" || body === null) return 100;
  const value = (body as Record<string, unknown>)["limit"];
  return typeof value === "number" && Number.isFinite(value) ? value : 100;
}

function readNonceBody(body: unknown): { caller: CallerId; targetGate: CallerId; nonce: string; expiresAt: string } {
  const record = asRecord(body);
  const caller = record["caller"];
  const targetGate = record["targetGate"];
  const nonce = record["nonce"];
  const expiresAt = record["expiresAt"];
  if (!isCaller(caller)) throw new Error("INVALID_NONCE_CALLER");
  if (!isCaller(targetGate) || !isGateId(targetGate)) throw new Error("INVALID_NONCE_TARGET_GATE");
  if (typeof nonce !== "string" || nonce.length < 8) throw new Error("INVALID_NONCE");
  if (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt))) throw new Error("INVALID_NONCE_EXPIRY");
  return { caller, targetGate, nonce, expiresAt };
}

function readAuditBody(body: unknown, caller: CallerId): RingEventInput {
  const record = asRecord(body);
  const eventId = record["eventId"];
  const occurredAt = record["occurredAt"];
  const eventType = record["eventType"];
  const gate = record["gate"];
  if (typeof eventId !== "string" || !isUuid(eventId)) throw new Error("INVALID_AUDIT_EVENT_ID");
  if (typeof occurredAt !== "string" || Number.isNaN(Date.parse(occurredAt))) throw new Error("INVALID_AUDIT_TIMESTAMP");
  if (eventType !== "gateway.accepted") throw new Error("INVALID_AUDIT_EVENT_TYPE");
  if (gate !== caller) throw new Error("AUDIT_SOURCE_MISMATCH");
  return { eventId, occurredAt, source: caller, eventType, payload: record };
}

function readRootApprovalBody(body: unknown): { manifest: ReturnType<typeof validateRootApprovalManifest>; signatureBase64: string } {
  const record = asRecord(body);
  const manifest = validateRootApprovalManifest(record["manifest"]);
  const signatureBase64 = record["signatureBase64"];
  if (typeof signatureBase64 !== "string" || signatureBase64.length < 16) throw new Error("INVALID_ROOT_APPROVAL_SIGNATURE");
  return { manifest, signatureBase64 };
}

function readProposal(body: unknown): ProposalInput {
  const record = asRecord(body);
  const proposalId = record["proposalId"];
  const createdAt = record["createdAt"];
  const targetGate = record["targetGate"];
  const requestedCapability = record["requestedCapability"];
  const thesis = record["thesis"];
  if (typeof proposalId !== "string" || !isUuid(proposalId)) throw new Error("INVALID_PROPOSAL_ID");
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) throw new Error("INVALID_PROPOSAL_TIMESTAMP");
  if (!isGateId(targetGate)) throw new Error("INVALID_PROPOSAL_TARGET_GATE");
  if (typeof requestedCapability !== "string" || requestedCapability.length < 3) throw new Error("INVALID_PROPOSAL_CAPABILITY");
  if (typeof thesis !== "string" || thesis.trim().length < 3) throw new Error("INVALID_PROPOSAL_THESIS");
  return {
    proposalId,
    createdAt,
    targetGate,
    requestedCapability,
    thesis,
    proposal: record["proposal"],
    evidence: record["evidence"],
    provenance: record["provenance"],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("BODY_MUST_BE_OBJECT");
  return value as Record<string, unknown>;
}

function isCaller(value: unknown): value is CallerId {
  return value === "shiloh" || value === "root-authority" || isGateId(value) || (typeof value === "string" && value.startsWith("external:") && value.length > 9);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseClockSkew(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1_000 || value > 300_000) throw new Error("INVALID_CLOCK_SKEW");
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value;
}
