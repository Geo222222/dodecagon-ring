import { startGateServer } from "@dodecagon/gate-runtime";

const processLog = [
  {
    sequence: 1,
    at: new Date().toISOString(),
    event: "foundation.bootstrap",
    message: "Reuben foundation boundary initialized.",
  },
] as const;

startGateServer({
  gateId: "reuben",
  port: Number(process.env["PORT"] ?? 4101),
  capabilities: {
    "foundation.health.read": async () => ({ status: "ready", sovereign: true }),
    "foundation.logs.read": async () => ({ entries: processLog }),
  },
});
