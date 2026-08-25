# Dodecagon Constitution — Phase 1

## 1. Sovereignty

There are exactly twelve sovereign Gate identifiers in protocol version `dodecagon/1`. A Gate may expose capabilities to other Gates or engines without surrendering ownership of its state.

## 2. Courtyard engines

Shiloh is a courtyard engine, not a Gate. Her identity can authenticate requests, but her authorization ceiling is `read` and `propose`.

**Invariant:** `caller = shiloh && intent = execute` is denied before any Gate handler is invoked.

## 3. Proposal vs. execution

A proposal is non-authoritative structured output. It can contain code, a patch, a plan, a scenario, or a requested state transition. A proposal never becomes authoritative merely because an AI generated it.

Execution is a sovereign state transition and requires the target Gate's authorization plus any Root Authority approval required by policy.

## 4. Gate boundaries

- No direct cross-Gate database access.
- No undocumented cross-Gate filesystem coupling.
- All inter-Gate calls use the signed boundary envelope.
- A target Gate must explicitly declare every accepted capability.
- Unknown callers, unknown capabilities, invalid signatures, replay/nonce failures (when persistence is enabled), and forbidden intent classes fail closed.

## 5. Root Authority

Consequential deployment is manual and cryptographically verified. The root deployment workflow is `workflow_dispatch` only and verifies a signature against `ROOT_AUTHORITY_PUBLIC_KEY_PEM`.

The repository deliberately ships without a Root private key and without a default public key. Until Root Authority configures the verification key and the GitHub `root-authority` environment/reviewer policy, the workflow fails closed.

## 6. AI authority

Model output is advisory unless a deterministic Gate contract converts an approved proposal into an authorized execution request. Shiloh never receives the Root Authority private key or Gate execution keys.

## 7. Change discipline

Phase changes are proposed on branches and reviewed before `main`. CI must pass strict lint, typecheck, tests, and build.
