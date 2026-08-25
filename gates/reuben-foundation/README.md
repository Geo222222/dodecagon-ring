# Reuben — Foundation

Phase 1 North Wall starter Gate.

Capabilities:
- `foundation.health.read`
- `foundation.logs.read`

Database foundation:
- `sql/001_foundation.sql` establishes append-only Ring events and a nonce ledger for replay protection.
- Phase 1 does not yet wire the HTTP process log to PostgreSQL; that integration is intentionally the next Reuben slice.

This service owns foundation state. Other Gates and Shiloh only interact through `/v1/gateway`.
