# Local Model Runtime Policy

## Non-negotiable rule
ZForge uses only open-source software and model artifacts that are legally usable at zero budget. No paid API, subscription, hosted model credit, expiring trial, proprietary inference endpoint, or required commercial account is permitted.

## Runtime boundary
- Model inference must run locally or on a user-controlled self-hosted machine.
- The current Ollama adapter permits loopback HTTP only and does not call external model providers.
- GitHub Pages cannot host model inference. GitHub Actions runners are ephemeral and are not a permanent inference server.
- A phone PWA is a client interface, not a promise that a large language model can run on the phone.
- Local runtime software being open source does not make every model available through it open source.

## Model admission checklist
For every exact model name, version/revision and quantization:
1. Canonical model repository and publisher.
2. Full model license and any acceptable-use restrictions.
3. Training-data and derivative-use terms where published.
4. Commercial-use and redistribution rights, where relevant.
5. Weight file provenance, hashes and source.
6. Runtime compatibility, tokenizer, context length and supported tool-calling format.
7. Hardware profile: RAM/VRAM, CPU/GPU/accelerator, disk and expected latency.
8. Prompt-injection and unsafe-output evaluation.
9. Reproducible workload tests for planning, code generation, tool selection and Arabic/RTL.
10. Fallback model and rollback pin.

Unknown or restrictive model terms mean QUARANTINED. Never assume a model is open source because weights are downloadable or because the inference runtime is MIT/Apache licensed.

## Model adapter policy
- Provider adapters must be replaceable and must not leak vendor-specific APIs into Chief Agent logic.
- Local-only adapters are preferred. A remote endpoint is not accepted unless it is demonstrably open-source, self-hosted and controlled by the user.
- No credentials or privileged tools are passed into model prompts.
- Model output is an untrusted proposal. It cannot directly execute shell commands, write repositories, publish, sign, or change permissions.
- Every proposed action is validated by deterministic policy code and requires the relevant approval.

See [MODEL_REGISTRY.md](../memory/MODEL_REGISTRY.md) for the checkpoint-level admission queue and benchmark record.

## Current implementation
- Implemented: local Ollama adapter for model listing and non-streaming chat on loopback only.
- Implemented: Chief Agent planning orchestrator that loads memory, invokes bounded discovery, asks the local model for a draft plan and returns it as approval-required.
- Not implemented: model installation/downloading, automatic model-license verification, model benchmarking, persistent memory provider, task gateway, worker execution, or live Black Phantom connection.
