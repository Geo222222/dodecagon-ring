import { createPublicKey, verify } from "node:crypto";

const required = [
  "DODECAGON_APPROVAL_ID",
  "DODECAGON_REPOSITORY",
  "DODECAGON_SHA",
  "DODECAGON_OPERATION",
  "DODECAGON_ISSUED_AT",
  "DODECAGON_EXPIRES_AT",
  "DODECAGON_ROOT_SIGNATURE_B64",
  "ROOT_AUTHORITY_PUBLIC_KEY_PEM",
];
for (const name of required) if (!process.env[name]) fail(`Missing required Root Authority input: ${name}`, 2);

const manifest = {
  protocol: "dodecagon/root-approval/1",
  approvalId: process.env.DODECAGON_APPROVAL_ID,
  repository: process.env.DODECAGON_REPOSITORY,
  commitSha: process.env.DODECAGON_SHA,
  operation: process.env.DODECAGON_OPERATION,
  issuedAt: process.env.DODECAGON_ISSUED_AT,
  expiresAt: process.env.DODECAGON_EXPIRES_AT,
};

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.approvalId)) fail("ROOT_APPROVAL_ID_INVALID", 2);
if (!/^[0-9a-f]{40,64}$/i.test(manifest.commitSha)) fail("ROOT_APPROVAL_SHA_INVALID", 2);
const issuedAt = Date.parse(manifest.issuedAt);
const expiresAt = Date.parse(manifest.expiresAt);
const now = Date.now();
if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) fail("ROOT_APPROVAL_TIME_INVALID", 2);
if (expiresAt <= issuedAt || expiresAt - issuedAt > 60 * 60_000 || issuedAt > now + 60_000 || expiresAt <= now) {
  fail("ROOT_APPROVAL_WINDOW_INVALID", 3);
}

const ok = verify(
  null,
  Buffer.from(canonicalJson(manifest), "utf8"),
  createPublicKey(process.env.ROOT_AUTHORITY_PUBLIC_KEY_PEM),
  Buffer.from(process.env.DODECAGON_ROOT_SIGNATURE_B64, "base64"),
);
if (!ok) fail("ROOT_AUTHORITY_SIGNATURE_INVALID", 4);
console.log(`ROOT_AUTHORITY_SIGNATURE_VALID:${manifest.approvalId}`);

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function fail(message, code) {
  console.error(message);
  process.exit(code);
}
