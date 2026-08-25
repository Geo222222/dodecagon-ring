import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CallerId, GateId, GateResponse } from "@dodecagon/protocol";
import {
  createGatewayAdapter,
  type GateCapability,
} from "@dodecagon/gateway-adapter";

export interface GateServerConfig {
  gateId: GateId;
  port: number;
  capabilities: Readonly<Record<string, GateCapability>>;
}

type Gateway = (input: unknown) => Promise<GateResponse>;

export function startGateServer(config: GateServerConfig): void {
  const trusted = parseTrustMap(process.env["DODECAGON_TRUSTED_CALLERS_JSON"] ?? "{}");
  const gateway = createGatewayAdapter({
    gateId: config.gateId,
    capabilities: config.capabilities,
    resolveCallerPublicKey: (caller) => trusted[caller],
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
    response.statusCode = result.ok ? 200 : 403;
    response.end(JSON.stringify(result));
  } catch (error) {
    response.statusCode = 400;
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "BAD_REQUEST" }));
  }
}

function parseTrustMap(raw: string): Partial<Record<CallerId, string>> {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) throw new Error("DODECAGON_TRUSTED_CALLERS_JSON must be an object");
  return parsed as Partial<Record<CallerId, string>>;
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
