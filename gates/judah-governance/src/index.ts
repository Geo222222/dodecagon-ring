import { startGateServer } from "@dodecagon/gate-runtime";

const policy = Object.freeze({
  sovereign: true,
  executionAuthority: "gate-plus-root-policy",
  shilohExecution: false,
  crossGateDatabaseAccess: false,
});

startGateServer({
  gateId: "judah",
  port: Number(process.env["PORT"] ?? 4102),
  capabilities: {
    "governance.policy.read": {
      intents: ["read"],
      callers: ["shiloh", "reuben", "joseph", "root-authority"],
      handler: async () => policy,
    },
    "governance.proposal.create": {
      intents: ["propose"],
      callers: ["shiloh", "reuben", "joseph", "root-authority"],
      handler: async (envelope) => ({
        proposalId: envelope.requestId,
        authoritative: false,
        receivedAt: new Date().toISOString(),
        proposal: envelope.body,
      }),
    },
  },
});
