BEGIN;

CREATE OR REPLACE FUNCTION dodecagon_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'DODECAGON_APPEND_ONLY_VIOLATION:%', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS ring_events_append_only ON ring_events;
CREATE TRIGGER ring_events_append_only
BEFORE UPDATE OR DELETE ON ring_events
FOR EACH ROW EXECUTE FUNCTION dodecagon_reject_mutation();

DROP TRIGGER IF EXISTS request_nonces_append_only ON request_nonces;
CREATE TRIGGER request_nonces_append_only
BEFORE UPDATE OR DELETE ON request_nonces
FOR EACH ROW EXECUTE FUNCTION dodecagon_reject_mutation();

CREATE TABLE IF NOT EXISTS root_approvals (
  approval_id UUID PRIMARY KEY,
  repository TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  operation TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  signature_b64 TEXT NOT NULL,
  manifest_hash TEXT NOT NULL UNIQUE,
  consumer_request_id UUID NOT NULL UNIQUE,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT root_approval_window CHECK (expires_at > issued_at)
);

DROP TRIGGER IF EXISTS root_approvals_append_only ON root_approvals;
CREATE TRIGGER root_approvals_append_only
BEFORE UPDATE OR DELETE ON root_approvals
FOR EACH ROW EXECUTE FUNCTION dodecagon_reject_mutation();

CREATE TABLE IF NOT EXISTS shiloh_proposals (
  proposal_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  target_gate TEXT NOT NULL,
  requested_capability TEXT NOT NULL,
  thesis TEXT NOT NULL,
  proposal JSONB NOT NULL,
  evidence JSONB NOT NULL,
  provenance JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  CONSTRAINT shiloh_proposal_status CHECK (status = 'proposed')
);

DROP TRIGGER IF EXISTS shiloh_proposals_append_only ON shiloh_proposals;
CREATE TRIGGER shiloh_proposals_append_only
BEFORE UPDATE OR DELETE ON shiloh_proposals
FOR EACH ROW EXECUTE FUNCTION dodecagon_reject_mutation();

CREATE INDEX IF NOT EXISTS idx_root_approvals_consumed_at
  ON root_approvals (consumed_at DESC);

CREATE INDEX IF NOT EXISTS idx_shiloh_proposals_created_at
  ON shiloh_proposals (created_at DESC);

COMMIT;
