# Prompt Changelog

Canonical prompt changes require rationale, evidence, reviewed diff, regression tests, and rollback.

Template: date/prompt/version; motivation/evidence; behavior changed; tests; results; reviewer/approval; rollback.

- v0.1 — Initial Chief Agent and Agent Architect prompts. Establishes memory preflight, evidence-based selection, zero-budget policy, and reversible prompt evolution.


- v0.2 — Expanded Chief Agent and Agent Architect instructions for universal GitHub/vendor discovery, strict open-source/zero-budget gates, toolchain compatibility, local-only inference, isolated execution, update review and independent approval. Evidence: docs/UNIVERSAL_DISCOVERY_ENGINE.md, docs/MODEL_RUNTIME_POLICY.md, docs/EXECUTION_RUNTIME_CONTRACT.md. Prompt-specific regression suite remains pending; runtime behavior is not yet connected.
