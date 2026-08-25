import { startGateServer } from "@dodecagon/gate-runtime";

const capitalFramework = Object.freeze({
  phase: 1,
  executionEnabled: false,
  custodyEnabled: false,
  transfersEnabled: false,
  tradingEnabled: false,
  purpose: "Model capital frameworks and scenarios without moving money.",
});

startGateServer({
  gateId: "joseph",
  port: Number(process.env["PORT"] ?? 4201),
  capabilities: {
    "capital.framework.read": async () => capitalFramework,
    "capital.scenario.propose": async (envelope) => ({
      scenarioId: envelope.requestId,
      authoritative: false,
      executionEnabled: false,
      input: envelope.body,
    }),
  },
});
