import { createHash } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import {
  canonicalJson,
  isRootApprovalCurrentlyValid,
  validateRootApprovalManifest,
  verifyRootApprovalSignature,
  type CallerId,
  type GateId,
  type RootApprovalManifest,
} from "@dodecagon/protocol";

const RING_EVENT_LOCK = 724_636_521;

export interface RingEventInput {
  eventId: string;
  occurredAt: string;
  source: string;
  eventType: string;
  payload: unknown;
}

export interface RingEventRecord extends RingEventInput {
  sequence: string;
  previousHash: string | null;
  eventHash: string;
}

export interface ProposalInput {
  proposalId: string;
  createdAt: string;
  targetGate: GateId;
  requestedCapability: string;
  thesis: string;
  proposal: unknown;
  evidence: unknown;
  provenance: unknown;
}

interface RingEventRow extends QueryResultRow {
  event_id: string;
  sequence: string;
  occurred_at: string;
  source: string;
  event_type: string;
  payload: unknown;
  previous_hash: string | null;
  event_hash: string;
}

interface HashRow extends QueryResultRow {
  event_hash: string;
}

export class ReubenStore {
  readonly #pool: Pool;

  constructor(connectionString: string) {
    if (connectionString.trim() === "") throw new Error("DATABASE_URL is required");
    this.#pool = new Pool({ connectionString, max: 10 });
  }

  async consumeNonce(caller: CallerId, nonce: string, expiresAt: string): Promise<boolean> {
    const result = await this.#pool.query(
      `INSERT INTO request_nonces (caller_id, nonce, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (caller_id, nonce) DO NOTHING
       RETURNING nonce`,
      [caller, nonce, expiresAt],
    );
    return result.rowCount === 1;
  }

  async appendEvent(event: RingEventInput): Promise<RingEventRecord> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const record = await appendEventTx(client, event);
      await client.query("COMMIT");
      return record;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listEvents(limit: number): Promise<RingEventRecord[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const result = await this.#pool.query<RingEventRow>(
      `SELECT event_id, sequence::text AS sequence, occurred_at::text AS occurred_at,
              source, event_type, payload, previous_hash, event_hash
       FROM ring_events
       ORDER BY sequence DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map(mapEventRow);
  }

  async verifyChain(): Promise<{ valid: boolean; eventsChecked: number; headHash: string | null }> {
    const result = await this.#pool.query<RingEventRow>(
      `SELECT event_id, sequence::text AS sequence, occurred_at::text AS occurred_at,
              source, event_type, payload, previous_hash, event_hash
       FROM ring_events
       ORDER BY sequence ASC`,
    );

    let previousHash: string | null = null;
    for (const row of result.rows) {
      const event = mapEventRow(row);
      const expected = computeRingEventHash(event, previousHash);
      if (event.previousHash !== previousHash || event.eventHash !== expected) {
        return { valid: false, eventsChecked: result.rows.indexOf(row) + 1, headHash: previousHash };
      }
      previousHash = event.eventHash;
    }
    return { valid: true, eventsChecked: result.rows.length, headHash: previousHash };
  }

  async consumeRootApproval(input: {
    manifest: RootApprovalManifest;
    signatureBase64: string;
    rootPublicKeyPem: string;
    consumerRequestId: string;
  }): Promise<boolean> {
    const manifest = validateRootApprovalManifest(input.manifest);
    if (!isRootApprovalCurrentlyValid(manifest)) throw new Error("ROOT_APPROVAL_WINDOW_INVALID");
    if (!verifyRootApprovalSignature(manifest, input.signatureBase64, input.rootPublicKeyPem)) {
      throw new Error("ROOT_APPROVAL_SIGNATURE_INVALID");
    }

    const manifestHash = sha256(canonicalJson(manifest));
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO root_approvals (
           approval_id, repository, commit_sha, operation, issued_at, expires_at,
           signature_b64, manifest_hash, consumer_request_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (approval_id) DO NOTHING
         RETURNING approval_id`,
        [
          manifest.approvalId,
          manifest.repository,
          manifest.commitSha,
          manifest.operation,
          manifest.issuedAt,
          manifest.expiresAt,
          input.signatureBase64,
          manifestHash,
          input.consumerRequestId,
        ],
      );
      if (inserted.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }

      await appendEventTx(client, {
        eventId: manifest.approvalId,
        occurredAt: new Date().toISOString(),
        source: "root-authority",
        eventType: "root.approval.consumed",
        payload: {
          approvalId: manifest.approvalId,
          repository: manifest.repository,
          commitSha: manifest.commitSha,
          operation: manifest.operation,
          manifestHash,
          consumerRequestId: input.consumerRequestId,
        },
      });
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordProposal(input: ProposalInput): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO shiloh_proposals (
           proposal_id, created_at, target_gate, requested_capability, thesis,
           proposal, evidence, provenance
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
        [
          input.proposalId,
          input.createdAt,
          input.targetGate,
          input.requestedCapability,
          input.thesis,
          JSON.stringify(input.proposal),
          JSON.stringify(input.evidence),
          JSON.stringify(input.provenance),
        ],
      );
      await appendEventTx(client, {
        eventId: input.proposalId,
        occurredAt: input.createdAt,
        source: "shiloh",
        eventType: "shiloh.proposal.recorded",
        payload: {
          proposalId: input.proposalId,
          targetGate: input.targetGate,
          requestedCapability: input.requestedCapability,
        },
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}

export function computeRingEventHash(event: RingEventInput, previousHash: string | null): string {
  return sha256(
    canonicalJson({
      eventId: event.eventId,
      occurredAt: canonicalTimestamp(event.occurredAt),
      source: event.source,
      eventType: event.eventType,
      payload: event.payload,
      previousHash,
    }),
  );
}

async function appendEventTx(client: PoolClient, input: RingEventInput): Promise<RingEventRecord> {
  const occurredAt = canonicalTimestamp(input.occurredAt);
  await client.query("SELECT pg_advisory_xact_lock($1)", [RING_EVENT_LOCK]);
  const previous = await client.query<HashRow>(
    "SELECT event_hash FROM ring_events ORDER BY sequence DESC LIMIT 1",
  );
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const eventHash = computeRingEventHash({ ...input, occurredAt }, previousHash);
  const inserted = await client.query<RingEventRow>(
    `INSERT INTO ring_events (
       event_id, occurred_at, source, event_type, payload, previous_hash, event_hash
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
     RETURNING event_id, sequence::text AS sequence, occurred_at::text AS occurred_at,
               source, event_type, payload, previous_hash, event_hash`,
    [
      input.eventId,
      occurredAt,
      input.source,
      input.eventType,
      JSON.stringify(input.payload),
      previousHash,
      eventHash,
    ],
  );
  const row = inserted.rows[0];
  if (row === undefined) throw new Error("RING_EVENT_INSERT_FAILED");
  return mapEventRow(row);
}

function mapEventRow(row: RingEventRow): RingEventRecord {
  return {
    eventId: row.event_id,
    sequence: row.sequence,
    occurredAt: canonicalTimestamp(row.occurred_at),
    source: row.source,
    eventType: row.event_type,
    payload: row.payload,
    previousHash: row.previous_hash,
    eventHash: row.event_hash,
  };
}

function canonicalTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_EVENT_TIMESTAMP");
  return date.toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
