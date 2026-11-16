<div align="center">
  <img src="assets/hero-image.png" alt="ZForge Swarm AI" width="100%" style="border-radius: 10px; box-shadow: 0px 4px 15px rgba(0,0,0,0.5);">
  <br><br>
  <h1>🌌 ZForge: Autonomous AGI Swarm Architecture</h1>
  <p><b>A Zero-Cost, Self-Replicating, Event-Driven AI Ecosystem</b></p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![GitHub Actions](https://img.shields.io/badge/Compute-GitHub_Actions-blue.svg)](https://github.com/features/actions)
  [![Architecture](https://img.shields.io/badge/Architecture-Serverless_Swarm-success.svg)](#)
</div>

<hr>

## 🧠 System Overview
ZForge is not a single AI model; it is a decentralized factory of specialized micro-agents. Operating entirely on client-side logic and serverless GitHub Actions, it acts as an intent-resolution engine that builds its own tools, heals its own errors, and executes complex tasks without incurring centralized infrastructure costs.

## ⚙️ The Agent Swarm
The ecosystem is orchestrated by the **Master Builder**, delegating tasks to a resilient pool of autonomous agents:
*   **R&D & Scavenger:** Scrapes GitHub for open-source repositories and zero-cost APIs, indexing tools for the swarm.
*   **The Blacksmith (Tool-Maker):** Writes logic and API wrappers to synthesize missing capabilities using available open-source fragments.
*   **QA Sandboxer:** Tests new scripts inside isolated environments before merging to the main production branch.
*   **Root-Cause Healer:** Analyzes execution logs and rewrites source code to immunize the system against infinite loops and recurrent errors.
*   **Resource Manager:** Enforces rate limits, handles API fallbacks, and ensures 100% zero-cost operation.

## 🚀 Deployment & Execution
This system relies on a **Just-In-Time (JIT) Execution Fabric**. Agents remain dormant in the repository and are activated exclusively via `workflow_dispatch` events. Upon task completion, they return to standby or are automatically replenished by the Master Builder.
