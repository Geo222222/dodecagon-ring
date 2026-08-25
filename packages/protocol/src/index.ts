import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export const GATE_IDS = [
  "reuben",
  "judah",
  "levi",
  "joseph",
  "benjamin",
  "dan",
  "simeon",
  "issachar",
  "zebulun",
  "gad",
  "asher",
  "naphtali",
] as const;

export type GateId = (typeof GATE_IDS)[number];
export type DodecagonIntent = "read" | "propose" | "execute";
export type CallerId = GateId | "shiloh" | "root-authority" | `external:${string}`;

export interface DodecagonEnvelope {
  protocol: "dodecagon/1";
  requestId: string;
  timestamp: string;
  nonce: string;
  caller: CallerId;
  targetGate: GateId;
  intent: DodecagonIntent;
  capability: string;
  body: unknown;
  signature: string;
}

export interface GateResponse<T = unknown> {
  ok: boolean;
  gate: GateId;
  requestId: string;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export function isGateId(value: unknown): value is GateId {
  return typeof value === "string" && (GATE_IDS as readonly string[]).includes(value);
}

export function validateEnvelope(value: unknown): DodecagonEnvelope {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Envelope must be an object");
  }

  const item = value as Record<string, unknown>;
  if (item["protocol"] !== "dodecagon/1") throw new TypeError("Unsupported protocol");
  if (typeof item["requestId"] !== "string" || item["requestId"].length < 8) throw new TypeError("Invalid requestId");
  if (typeof item["timestamp"] !== "string" || Number.isNaN(Date.parse(item["timestamp"]))) throw new TypeError("Invalid timestamp");
  if (typeof item["nonce"] !== "string" || item["nonce"].length < 8) throw new TypeError("Invalid nonce");
  if (!isCallerId(item["caller"])) throw new TypeError("Invalid caller");
  if (!isGateId(item["targetGate"])) throw new TypeError("Invalid targetGate");
  if (!isIntent(item["intent"])) throw new TypeError("Invalid intent");
  if (typeof item["capability"] !== "string" || item["capability"].length < 3) throw new TypeError("Invalid capability");
  if (typeof item["signature"] !== "string" || item["signature"].length < 8) throw new TypeError("Invalid signature");

  return item as unknown as DodecagonEnvelope;
}

export function signingPayload(envelope: Omit<DodecagonEnvelope, "signature"> | DodecagonEnvelope): string {
  const { signature: _signature, ...unsigned } = envelope as DodecagonEnvelope;
  return canonicalJson(unsigned);
}

export function signEnvelope(
  envelope: Omit<DodecagonEnvelope, "signature">,
  privateKeyPem: string,
): DodecagonEnvelope {
  const signature = sign(
    null,
    Buffer.from(signingPayload(envelope), "utf8"),
    createPrivateKey(privateKeyPem),
  ).toString("base64");

  return { ...envelope, signature };
}

export function verifyEnvelopeSignature(envelope: DodecagonEnvelope, publicKeyPem: string): boolean {
  return verify(
    null,
    Buffer.from(signingPayload(envelope), "utf8"),
    createPublicKey(publicKeyPem),
    Buffer.from(envelope.signature, "base64"),
  );
}

export function canonicalJson(value: unknown): string {
  if (value === undefined) throw new TypeError("Undefined values are not allowed in signed payloads");

  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError("Value cannot be represented in canonical JSON");
    return encoded;
  }

  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function isIntent(value: unknown): value is DodecagonIntent {
  return value === "read" || value === "propose" || value === "execute";
}

function isCallerId(value: unknown): value is CallerId {
  if (value === "shiloh" || value === "root-authority" || isGateId(value)) return true;
  return typeof value === "string" && value.startsWith("external:") && value.length > 9;
}
