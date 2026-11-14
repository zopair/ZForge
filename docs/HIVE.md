# ZFORGE HIVE — Local Multi-Model Orchestration

## Purpose

HIVE separates specialist responsibilities from model vendors and model names. The existing Agent Factory remains responsible for agent identity, activation, permissions and resource profiles; the existing DAG coordinator remains responsible for dependency order and bounded parallelism. HIVE adds a local model-routing layer instead of creating a competing agent runtime.

## Current implementation

- `LocalModelRouter` reads the exact installed model list from the configured local model adapter.
- Specialist roles can map to different locally installed models.
- An unavailable configured specialist model falls back to the verified default model and emits a route event.
- An explicit per-task model override is rejected unless it is installed locally.
- Chief Agent orchestration plans may attach a validated `modelRole` to each task.
- Coordinator progress includes `agent.model.selected`; task results retain the selected model.
- `resolveIndependentReview` selects a different installed model from the author model, or reports that independent review is unavailable. It never pretends that a same-model pass is independent.
- Model routing initializes lazily on the first delegated task so the gateway can still start when the local model runtime is temporarily offline.

## Zero-budget runtime

HIVE currently uses the existing local Ollama adapter. It does not call Claude, Gemini, OpenAI, hosted inference APIs, trial credits or paid services. Models must be installed by the operator on a user-controlled machine and independently pass the checkpoint-level license and resource review in [MODEL_RUNTIME_POLICY.md](MODEL_RUNTIME_POLICY.md). A model family name is not license evidence.

## Configuration

The default model remains `ZFORGE_MODEL`. Optional role mappings are supplied as a JSON object through `ZFORGE_MODEL_ROUTES`:

```bash
ZFORGE_MODEL=qwen3:8b
ZFORGE_MODEL_ROUTES='{"architecture":"qwen3:8b","research":"gemma3:4b","coding":"deepseek-coder:6.7b","review":"gemma3:4b"}'
```

Only exact names returned by the local runtime are eligible. If a configured role model is absent, that task uses the default model and records the fallback. Explicit model overrides that are not installed fail closed.

A task may specify `modelRole` in its orchestration plan. The role is a routing hint, not an agent permission or a model capability guarantee.

## Resource-aware operating rule

Multiple specialist tasks may execute concurrently, but the local hardware is shared. `ZFORGE_MAX_PARALLEL_AGENTS` remains the concurrency ceiling. On phones or low-memory hosts, use a small value or schedule tasks sequentially; do not assume several large checkpoints can remain resident simultaneously. Model routing does not download models or silently change host resource limits.

## Deliberate next increments

1. Add an explicit reviewer stage to the task lifecycle, using a distinct installed model and a structured review contract.
2. Capture reviewer findings as evidence and require fixes/re-review for material findings.
3. Add reproducible per-model benchmarks for planning, code repair, tool selection, Arabic quality, latency and memory.
4. Add measured model selection using workload capability and host resource profiles, while retaining deterministic fallback and operator visibility.

Independent review selection is available as a core primitive; the automatic review stage is not yet wired into task completion. Do not label a task independently reviewed until that stage produces review evidence.
