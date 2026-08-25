# Shiloh

Shiloh is the central intelligent engine inside the Dodecagon courtyard.

She is **not sovereign territory**.

Phase 1:
- authenticates with her own Ed25519 identity key;
- can send only `read` or `propose` requests;
- monitors Reuben through `foundation.logs.read`;
- has no Root Authority key and no Gate execution key;
- is independently denied by Ring authorization if an `execute` envelope is ever constructed.

No model provider is coupled to the protocol in Phase 1. Model configuration can be added behind this authority boundary without changing Gate sovereignty.
