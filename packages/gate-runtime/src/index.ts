import { createServer, type IncomingMessage } from "node:http";
import type { CallerId, GateId } from "@dodecagon/protocol";
import {
  createGatewayAdapter,
  type GateCapability,
} from "@dodecagon/gateway-adapter";

export interface GateServerConfig {
  gateId: GateId;
  port: number;
  capabilities: Readonly<Record<string, GateCapability>>;
}

export function startGateServer(config: GateServerConfig): void {
  const trusted = parseTrustMap(process.env["DODECAGON_TRUSTED_CALLERS_JSON"] ?? "{}");
  const gateway = createGatewayAdapter({
    gateId: config.gateId,
    capabilities: config.capabilities,
    resolveCallerPublicKey: (caller) => trusted[caller],
  });

  const server = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");

    if (request.method === "GET" && request.url === "/health") {
      response.statusCode = 200;
      response.end(JSON.stringify({ ok: true, gate: config.gateId }));
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
  });

  server.listen(config.port, "127.0.0.1", () => {
    console.log(JSON.stringify({ event: "gate.started", gate: config.gateId, port: config.port }));
  });
}

function parseTrustMap(raw: string): Partial<Record<CallerId, string>> {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) throw new Error("DODECAGON_TRUSTED_CALLERS_JSON must be an object");
  return parsed as Partial<Record<CallerId, string>>;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of request) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 1_048_576) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
