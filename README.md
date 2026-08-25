# Dodecagon Ring

Dodecagon is the Ring: a deterministic orchestration and governance workspace containing **12 sovereign Gates** and the **non-sovereign Shiloh intelligence engine**.

## Constitutional model

- **The Ring** is the deterministic gatekeeper and shared protocol surface.
- **The 12 Gates** are sovereign domains. Each owns its state, capabilities, authorization, and deployment.
- **Shiloh** operates inside the courtyard. She may read and propose through declared Gate capabilities, but she is never a Gate and cannot execute sovereign state changes.
- **Root Authority** is the only authority that can approve consequential cross-Gate deployment/state transitions.
- Gates do not reach into one another's databases. Interactions cross the signed Dodecagon boundary envelope.

## Phase 1

This repository currently establishes:

1. pnpm + Turborepo workspace with strict TypeScript/ESLint policy.
2. Canonical 12-Gate registry.
3. Signed gateway envelope and deterministic authorization layer.
4. North/East starter services: Reuben, Judah, Joseph.
5. Read/propose-only Shiloh client pointed at Reuben logs.
6. CI and a fail-closed Root Authority approval workflow.

See `docs/architecture/PHASE1.md` and `docs/CONSTITUTION.md`.
