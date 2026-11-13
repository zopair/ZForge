# Local Model Registry

## Admission rule
This registry contains model families to investigate, not models approved for use. Every exact checkpoint, revision, quantization, tokenizer and associated artifact must pass the full license and resource review in [MODEL_RUNTIME_POLICY.md](../docs/MODEL_RUNTIME_POLICY.md).

## Candidate queue
| Family | Exact checkpoint/revision | Status | License evidence | Hardware profile | Workload tests |
|---|---|---|---|---|---|
| Qwen | Not selected | QUARANTINED | Exact model card/license not yet inspected | Not measured | Not run |
| DeepSeek | Not selected | QUARANTINED | Exact model card/license not yet inspected | Not measured | Not run |
| Other OSI-licensed open-weight models | Discover per task | QUARANTINED | Pending | Not measured | Not run |

No model family is approved by brand or architecture. Model licenses can differ between checkpoints, sizes, quantizations and versions.

## Required benchmark suite
1. Task decomposition and long-horizon planning.
2. Code generation and repair on representative ZForge tasks.
3. Tool selection and structured tool-call correctness.
4. Arabic comprehension, generation, RTL and code-switching.
5. Security: prompt injection from repository files, malicious tool output and unsafe command proposals.
6. Memory use: retrieve relevant lessons without inventing facts.
7. Resource use: RAM/VRAM, CPU/GPU utilization, storage, startup time, tokens/sec and latency.
8. Offline behavior and reproducibility.

## Model decision record template
- Exact model ID/revision and source:
- License text URL/hash:
- License compatibility and commercial-use finding:
- Weight/tokenizer files and checksums:
- Runtime and quantization:
- Hardware:
- Context length and tool-calling format:
- Benchmark dataset and test commit:
- Accuracy/correctness:
- Arabic score:
- Safety findings:
- RAM/VRAM and latency:
- Failures and limitations:
- Fallback and rollback:
- Decision: VERIFIED / CONDITIONAL / QUARANTINED / REJECTED
- Date and reviewer:

## Current status
No model weights are installed, downloaded, licensed or benchmarked by ZForge. The Ollama adapter is a local transport adapter only; it does not approve model licenses or guarantee hardware feasibility.
