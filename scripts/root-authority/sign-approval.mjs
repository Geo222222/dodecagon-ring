#!/usr/bin/env node
import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const required = ["private-key", "repository", "sha", "operation"];
for (const name of required) {
  if (!args[name]) fail(`Missing --${name}`);
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const keyPath = resolve(String(args["private-key"]));
const pathFromRepo = relative(repoRoot, keyPath);
if (!pathFromRepo.startsWith("..") && !isAbsolute(pathFromRepo)) {
  fail("ROOT_PRIVATE_KEY_MUST_NOT_BE_INSIDE_REPOSITORY");
}

const ttlMinutes = Number(args["ttl-minutes"] ?? "15");
if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) fail("--ttl-minutes must be between 1 and 60");
const issuedAt = new Date();
const expiresAt = new Date(issuedAt.getTime() + ttlMinutes * 60_000);
const manifest = {
  protocol: "dodecagon/root-approval/1",
  approvalId: randomUUID(),
  repository: String(args.repository),
  commitSha: String(args.sha),
  operation: String(args.operation),
  issuedAt: issuedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
};
if (!/^[0-9a-f]{40,64}$/i.test(manifest.commitSha)) fail("--sha must be a full Git commit SHA");

const privateKeyPem = readFileSync(keyPath, "utf8");
const signatureBase64 = sign(
  null,
  Buffer.from(canonicalJson(manifest), "utf8"),
  createPrivateKey(privateKeyPem),
).toString("base64");

console.log(
  JSON.stringify(
    {
      manifest,
      signatureBase64,
      workflowInputs: {
        approval_id: manifest.approvalId,
        commit_sha: manifest.commitSha,
        operation: manifest.operation,
        issued_at: manifest.issuedAt,
        expires_at: manifest.expiresAt,
        signature_b64: signatureBase64,
      },
    },
    null,
    2,
  ),
);

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("Arguments must be --name value pairs");
    result[key.slice(2)] = value;
  }
  return result;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
