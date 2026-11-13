

## Agent Workspaces and Experimental Freedom
- Design principles and runtime-neutral contract: `docs/AGENT_WORKSPACES.md`.
- Workspace control plane: `src/core/agent-workspace-manager.js`.
- Tests: `test/agent-workspace-manager.test.js`.
- State: implementation added in the experimental-freedom branch; CI verification pending.
- Capabilities: broad defaults for filesystem, terminal, package installation, network research, Git, browser, test runner and artifact store; agents can add capabilities and select custom profiles.
- Experiment records preserve successful, failed and inconclusive outcomes, metrics, findings and artifacts. Successful experiments can be promoted to a reusable destination.
- Important limitation: this is currently the workspace/experiment control-plane model, not an actual host process, terminal, browser or container executor. Runtime adapters remain the next phase.
- Operating principle: `Freedom by Default, Guardrails by Context`. Prefer warnings, checkpoints and recovery over blanket denial. Failed experiments are reusable knowledge.
