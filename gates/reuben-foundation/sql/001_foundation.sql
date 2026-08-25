BEGIN;

CREATE TABLE IF NOT EXISTS ring_events (
  event_id UUID PRIMARY KEY,
  sequence BIGSERIAL UNIQUE NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  previous_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS request_nonces (
  caller_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (caller_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_ring_events_occurred_at
  ON ring_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_nonces_expires_at
  ON request_nonces (expires_at);

-- The application role must not receive UPDATE/DELETE on ring_events.
-- Corrections are appended as new events rather than mutating history.

COMMIT;
