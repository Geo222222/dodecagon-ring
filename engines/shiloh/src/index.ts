import { callGate } from "./client.js";

const privateKeyPem = process.env["SHILOH_PRIVATE_KEY_PEM"];
if (privateKeyPem === undefined || privateKeyPem.trim() === "") {
  throw new Error("SHILOH_PRIVATE_KEY_PEM is required for authenticated read/propose requests.");
}

const reubenBaseUrl = process.env["REUBEN_BASE_URL"] ?? "http://127.0.0.1:4101";

const result = await callGate({
  baseUrl: reubenBaseUrl,
  targetGate: "reuben",
  intent: "read",
  capability: "foundation.logs.read",
  body: { limit: 100 },
  privateKeyPem,
});

console.log(JSON.stringify({ event: "shiloh.monitor.reuben", result }));
