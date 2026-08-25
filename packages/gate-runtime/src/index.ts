import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CallerId, DodecagonEnvelope, GateId, GateResponse } from "@dodecagon/protocol";
import { signEnvelope } from "@dodecagon/protocol";
import {
  createGatewayAdapter,
  type GateCapability,
  type GatewayAuditEvent,
  type GatewaySecurity,
} from "@dodecagon/gateway-adapter";

export interface GateServerConfig {
  gateId: GateId;
  port: number;
  capabilities: Readonly<Record<string, GateCapability>>;
  security?: GatewaySecurity;
}

type Gateway = (input: unknown) => Promise<GateResponse>;

export function startGateServer(config: GateServerConfig): void {
  const trusted = parseTrustMap(process.env["DODECAGON_TRUSTED_CALLERS_JSON"] ?? "{}");
  const security = resolveSecurity(config);
  const gateway = createGatewayAdapter({
    gateId: config.gateId,
    capabilities: config.capabilities,
    resolveCallerPublicKey: (caller) => trusted[caller],
    security,
  });

  const server = createServer((request, response) => {
    void handleRequest(request, response, config.gateId, gateway).catch((error: unknown) => {
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("content-type", "application/json");
      }
      response.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "INTERNAL_ERROR",
        }),
      );
    });
  });

  server.listen(config.port, "127.0.0.1", () => {
    console.log(JSON.stringify({ event: "gate.started", gate: config.gateId, port: config.port }));
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  gateId: GateId,
  gateway: Gateway,
): Promise<void> {
  response.setHeader("content-type", "application/json");

  if (request.method === "GET" && request.url === "/health") {
    response.statusCode = 200;
    response.end(JSON.stringify({ ok: true, gate: gateId }));
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/gateway") {
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false, error: "NOT_FOUND" }));
    return;
  }

  try {
    const body = await readJson(request);
    const result = await gateway(body);
    console.log(
      JSON.stringify({
        event: "gateway.decision",
        gate: gateId,
        requestId: result.requestId,
        ok: result.ok,
        code: result.error?.code ?? "ACCEPTED",
      }),
    );
    response.statusCode = result.ok ? 200 : 403;
    response.end(JSON.stringify(result));
  } catch (error) {
    response.statusCode = 400;
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "BAD_REQUEST" }));
  }
}

function resolveSecurity(config: GateServerConfig): GatewaySecurity {
  if (config.security !== undefined) return config.security;
  if (config.gateId === "reuben") {
    throw new Error("Reuben must provide its local persistent GatewaySecurity implementation.");
  }
  return createRemoteReubenSecurity(config.gateId);
}

function createRemoteReubenSecurity(gateId: GateId): GatewaySecurity {
  const maxClockSkewMs = parseClockSkew(process.env["DODECAGON_MAX_CLOCK_SKEW_MS"] ?? "60000");
  return {
    maxClockSkewMs,
    consumeNonce: async (envelope, expiresAt) => {
      const data = await callReubenSecurity(gateId, "foundation.nonce.consume", {
        caller: envelope.caller,
        targetGate: gateId,
        nonce: envelope.nonce,
        expiresAt,
      });
      return readBoolean(data, "accepted");
    },
    recordAudit: async (event) => {
      await callReubenSecurity(gateId, "foundation.audit.append", event);
    },
  };
}

async function callReubenSecurity(gateId: GateId, capability: string, body: unknown): Promise<unknown> {
  const privateKeyPem = requiredEnv("DODECAGON_GATE_PRIVATE_KEY_PEM");
  const baseUrl = process.env["REUBEN_BASE_URL"] ?? "http://127.0.0.1:4101";
  const envelope = signEnvelope(
    {
      protocol: "dodecagon/1",
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      nonce: randomUUID(),
      caller: gateId,
      targetGate: "reuben",
      intent: "execute",
      capability,
      body,
    },
    privateKeyPem,
  );

  const response = await fetch(`${baseUrl}/v1/gateway`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });
  const decoded: unknown = await response.json();
  if (!response.ok || typeof decoded !== "object" || decoded === null) {
    throw new Error(`REUBEN_SECURITY_UNAVAILABLE:${response.status}`);
  }
  const record = decoded as Record<string, unknown>;
  if (record["ok"] !== true) {
    const error = record["error"];
    throw new Error(`REUBEN_SECURITY_REJECTED:${JSON.stringify(error)}`);
  }
  return record["data"];
}

function readBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "object" || value === null) throw new Error("INVALID_REUBEN_SECURITY_RESPONSE");
  const result = (value as Record<string, unknown>)[key];
  if (typeof result !== "boolean") throw new Error("INVALID_REUBEN_SECURITY_RESPONSE");
  return result;
}

function parseTrustMap(raw: string): Partial<Record<CallerId, string>> {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) throw new Error("DODECAGON_TRUSTED_CALLERS_JSON must be an object");
  return parsed as Partial<Record<CallerId, string>>;
}

function parseClockSkew(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1_000 || value > 300_000) {
    throw new Error("DODECAGON_MAX_CLOCK_SKEW_MS must be an integer between 1000 and 300000");
  }
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of request as AsyncIterable<unknown>) {
    const buffer = toBuffer(chunk);
    bytes += buffer.byteLength;
    if (bytes > 1_048_576) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function toBuffer(chunk: unknown): Buffer {
  if (typeof chunk === "string") return Buffer.from(chunk, "utf8");
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  throw new Error("INVALID_REQUEST_CHUNK");
}

export type { GatewayAuditEvent, GatewaySecurity, DodecagonEnvelope };
