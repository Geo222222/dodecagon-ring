# Phase 1 Architecture

## Workspace

```text
dodecagon-ring/
├─ config/
├─ docs/
├─ packages/
│  ├─ protocol/
│  ├─ ring-core/
│  ├─ gateway-adapter/
│  └─ gate-runtime/
├─ gates/
│  ├─ reuben-foundation/
│  ├─ judah-governance/
│  ├─ levi-stewardship/
│  ├─ joseph-capital/
│  ├─ benjamin-execution/
│  ├─ dan-judgment/
│  ├─ simeon-repair/
│  ├─ issachar-intelligence/
│  ├─ zebulun-commerce/
│  ├─ gad-defense/
│  ├─ asher-provision/
│  └─ naphtali-communications/
└─ engines/
   └─ shiloh/
```

## Request path

```text
caller
  -> signed dodecagon/1 envelope
  -> gateway-adapter
       1. schema validation
       2. target Gate match
       3. caller signature verification
       4. deterministic Ring authorization
       5. declared capability lookup
  -> Gate handler
  -> structured response
```

Shiloh's execution requests are rejected at step 4.

## Starter Gates

- **Reuben / Foundation** — health and append-only process-log read surface.
- **Judah / Governance** — policy read and non-authoritative proposal surface.
- **Joseph / Capital** — framework read and non-authoritative scenario proposal surface. Phase 1 intentionally performs no trades, transfers, custody, or account mutation.

## Root callback

`.github/workflows/root-authority-deploy.yml` accepts a commit SHA, operation label, and base64 Ed25519 signature. The signature covers:

```json
{
  "repository": "Geo222222/dodecagon-ring",
  "ref": "<git ref>",
  "sha": "<commit sha>",
  "operation": "<declared operation>"
}
```

The workflow verifies the payload using a public key supplied through `ROOT_AUTHORITY_PUBLIC_KEY_PEM`. This is a deployment authorization primitive, not a replacement for branch protection. Configure GitHub rulesets and required reviewers separately.
