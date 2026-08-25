import { createPublicKey, verify } from "node:crypto";

const required = [
  "DODECAGON_REPOSITORY",
  "DODECAGON_REF",
  "DODECAGON_SHA",
  "DODECAGON_OPERATION",
  "DODECAGON_ROOT_SIGNATURE_B64",
  "ROOT_AUTHORITY_PUBLIC_KEY_PEM",
];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required Root Authority input: ${name}`);
    process.exit(2);
  }
}

const payload = JSON.stringify({
  repository: process.env.DODECAGON_REPOSITORY,
  ref: process.env.DODECAGON_REF,
  sha: process.env.DODECAGON_SHA,
  operation: process.env.DODECAGON_OPERATION,
});

const ok = verify(
  null,
  Buffer.from(payload, "utf8"),
  createPublicKey(process.env.ROOT_AUTHORITY_PUBLIC_KEY_PEM),
  Buffer.from(process.env.DODECAGON_ROOT_SIGNATURE_B64, "base64"),
);

if (!ok) {
  console.error("ROOT_AUTHORITY_SIGNATURE_INVALID");
  process.exit(3);
}

console.log("ROOT_AUTHORITY_SIGNATURE_VALID");
