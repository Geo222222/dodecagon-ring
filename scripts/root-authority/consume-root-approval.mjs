#!/usr/bin/env node
import { createPrivateKey, randomUUID, sign } from "node:crypto";

const required = [
  "DODECAGON_APPROVAL_ID",
  "DODECAGON_REPOSITORY",
  "DODECAGON_SHA",
  "DODECAGON_OPERATION",
  "DODECAGON_ISSUED_AT",
  "DODECAGON_EXPIRES_AT",
  "DODECAGON_ROOT_SIGNATURE_B64",
  "DODECAGON_WORKFLOW_PRIVATE_KEY_PEM",
  "REUBEN_BASE_URL",
];
for (const name of required) if (!process.env[name]) fail(`Missing ${name}`);

const manifest = {
  protocol: "dodecagon/root-approval/1",
  approvalId: process.env.DODECAGON_APPROVAL_ID,
  repository: process.env.DODECAGON_REPOSITORY,
  commitSha: process.env.DODECAGON_SHA,
  operation: process.env.DODECAGON_OPERATION,
  issuedAt: process.env.DODECAGON_ISSUED_AT,
  expiresAt: process.env.DODECAGON_EXPIRES_AT,
};
const unsigned = {
  protocol: "dodecagon/1",
  requestId: randomUUID(),
  timestamp: new Date().toISOString(),
  nonce: randomUUID(),
  caller: "external:github-actions",
  targetGate: "reuben",
  intent: "execute",
  capability: "foundation.root-approval.consume",
  body: { manifest, signatureBase64: process.env.DODECAGON_ROOT_SIGNATURE_B64 },
};
const envelope = {
  ...unsigned,
  signature: sign(
    null,
    Buffer.from(canonicalJson(unsigned), "utf8"),
    createPrivateKey(process.env.DODECAGON_WORKFLOW_PRIVATE_KEY_PEM),
  ).toString("base64"),
};

const response = await fetch(`${process.env.REUBEN_BASE_URL}/v1/gateway`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(envelope),
});
const decoded = await response.json();
if (!response.ok || decoded?.ok !== true || decoded?.data?.accepted !== true) {
  fail(`ROOT_APPROVAL_NOT_CONSUMED:${JSON.stringify(decoded)}`);
}
console.log(`ROOT_APPROVAL_CONSUMED:${manifest.approvalId}`);

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function fail(message) {
  console.error(message);
  process.exit(3);
}
