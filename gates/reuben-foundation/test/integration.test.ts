import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rootApprovalPayload, type RootApprovalManifest } from "@dodecagon/protocol";
import { ReubenStore } from "../src/store.js";

const connectionString = requiredEnv("TEST_DATABASE_URL");
const store = new ReubenStore(connectionString);
const admin = new Pool({ connectionString });

beforeAll(async () => {
  const migration1 = readFileSync(fileURLToPath(new URL("../sql/001_foundation.sql", import.meta.url)), "utf8");
  const migration2 = readFileSync(fileURLToPath(new URL("../sql/002_authority_persistence.sql", import.meta.url)), "utf8");
  await admin.query(migration1);
  await admin.query(migration2);
});

afterAll(async () => {
  await store.close();
  await admin.end();
});

describe("Reuben PostgreSQL authority persistence", () => {
  it("atomically consumes a caller nonce exactly once", async () => {
    const nonce = randomUUID();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    expect(await store.consumeNonce("shiloh", nonce, expiresAt)).toBe(true);
    expect(await store.consumeNonce("shiloh", nonce, expiresAt)).toBe(false);
  });

  it("builds and verifies an append-only hash chain", async () => {
    const first = await store.appendEvent({
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      source: "reuben",
      eventType: "test.first",
      payload: { value: 1 },
    });
    const second = await store.appendEvent({
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      source: "reuben",
      eventType: "test.second",
      payload: { value: 2 },
    });
    expect(second.previousHash).toBe(first.eventHash);
    expect((await store.verifyChain()).valid).toBe(true);
    await expect(admin.query("UPDATE ring_events SET event_type = 'tampered' WHERE event_id = $1", [first.eventId])).rejects.toThrow(/DODECAGON_APPEND_ONLY_VIOLATION/);
  });

  it("consumes a signed Root approval only once", async () => {
    const keys = generateKeyPairSync("ed25519");
    const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
    const now = Date.now();
    const manifest: RootApprovalManifest = {
      protocol: "dodecagon/root-approval/1",
      approvalId: randomUUID(),
      repository: "Geo222222/dodecagon-ring",
      commitSha: "c".repeat(40),
      operation: "deploy:ring-m2",
      issuedAt: new Date(now - 1_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
    };
    const signatureBase64 = sign(null, Buffer.from(rootApprovalPayload(manifest), "utf8"), keys.privateKey).toString("base64");
    expect(
      await store.consumeRootApproval({
        manifest,
        signatureBase64,
        rootPublicKeyPem: publicKey,
        consumerRequestId: randomUUID(),
      }),
    ).toBe(true);
    expect(
      await store.consumeRootApproval({
        manifest,
        signatureBase64,
        rootPublicKeyPem: publicKey,
        consumerRequestId: randomUUID(),
      }),
    ).toBe(false);
  });

  it("records Shiloh proposals as append-only non-authoritative evidence", async () => {
    const proposalId = randomUUID();
    await store.recordProposal({
      proposalId,
      createdAt: new Date().toISOString(),
      targetGate: "judah",
      requestedCapability: "governance.policy.propose",
      thesis: "Test proposal",
      proposal: { change: "none" },
      evidence: [{ digestSha256: "d".repeat(64) }],
      provenance: { engine: "shiloh" },
    });
    const result = await admin.query<{ status: string }>(
      "SELECT status FROM shiloh_proposals WHERE proposal_id = $1",
      [proposalId],
    );
    expect(result.rows[0]?.status).toBe("proposed");
    await expect(admin.query("DELETE FROM shiloh_proposals WHERE proposal_id = $1", [proposalId])).rejects.toThrow(/DODECAGON_APPEND_ONLY_VIOLATION/);
  });
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required for integration tests`);
  return value;
}
