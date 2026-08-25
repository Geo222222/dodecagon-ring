# Ring M2 — Authority & Persistence

M2 hardens the Phase 1 Ring without adding sovereign domains.

## Invariants

1. Shiloh remains permanently incapable of `execute` intent.
2. Every accepted signed boundary request must pass timestamp tolerance and atomic nonce consumption before its handler runs.
3. Nonce rows are append-only. The same `(caller, nonce)` can never be consumed twice.
4. Accepted boundary decisions are appended to Reuben's Ring event ledger before the target handler runs.
5. Ring events form a serialized SHA-256 hash chain protected by a PostgreSQL transaction-scoped advisory lock.
6. Ring event, nonce, Root approval, and Shiloh proposal records reject `UPDATE` and `DELETE` at the database layer.
7. A Root approval is a detached Ed25519-signed manifest with a unique UUID, exact repository, exact commit SHA, exact operation, issuance time, and expiration time.
8. Root approval verification is not sufficient for execution. Reuben must atomically consume the approval ID. A second consumption attempt returns false and the workflow fails closed.
9. The Root private key is offline-only. GitHub receives the detached signature and public key, never the Root private key.
10. GitHub Actions uses a separate service identity only to transport an already Root-signed approval to Reuben for one-use consumption.

## Reuben persistence

Apply migrations in order:

```text
gates/reuben-foundation/sql/001_foundation.sql
gates/reuben-foundation/sql/002_authority_persistence.sql
```

`ring_events` is an append-only hash chain. `request_nonces` is the persistent replay ledger. `root_approvals` is the one-use Root handshake ledger. `shiloh_proposals` is an append-only, non-authoritative proposal record.

## Active Gate request path

For Reuben, nonce consumption and audit append use its local PostgreSQL store.

For Judah/Joseph, `gate-runtime` uses the Gate's own service identity to call Reuben's `foundation.nonce.consume` and `foundation.audit.append` capabilities over the normal signed `dodecagon/1` boundary. This avoids direct cross-Gate database access.

If Reuben, the Gate private key, or persistent security services are unavailable, the target Gate fails closed before its business handler executes.

## Root Authority signing

Generate a short-lived one-use manifest offline:

```bash
node scripts/root-authority/sign-approval.mjs \
  --private-key /offline/path/root-ed25519-private.pem \
  --repository Geo222222/dodecagon-ring \
  --sha <FULL_COMMIT_SHA> \
  --operation deploy:ring-m2
```

The signer refuses a private key located inside the repository. Default approval lifetime is 15 minutes and cannot exceed 60 minutes.

Copy only the generated workflow inputs into the manual `Root Authority Deployment Gate` workflow.

## GitHub environment requirements

The `root-authority` environment requires:

- `ROOT_AUTHORITY_PUBLIC_KEY_PEM`
- `DODECAGON_WORKFLOW_PRIVATE_KEY_PEM` (non-Root transport identity)
- `REUBEN_BASE_URL`
- required reviewer `@Geo222222`

Reuben's trust map must contain the matching public key for `external:github-actions`, and Reuben itself must receive `ROOT_AUTHORITY_PUBLIC_KEY_PEM` for independent signature verification at consumption time.

## Shiloh provenance

Shiloh converts observations into immutable evidence references by hashing canonical JSON. Proposals contain evidence references and provenance, then cross Reuben through `foundation.proposals.append` with `intent=propose`. No Shiloh code path exposes `intent=execute`.
