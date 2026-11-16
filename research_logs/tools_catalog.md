# Research Tools Catalog

This file is the canonical, human-reviewable index of discoveries. Record research findings here; do not place executable wrappers, scripts, credentials, or generated production code in this directory.

## Entry format

Use one dated subsection per discovery. Keep claims evidence-backed and include the original repository/API documentation links.

### YYYY-MM-DD — Discovery title

- Tool: Name and concise purpose.
- API: Public API name, endpoint family, or "None".
- Model: Model name and license/availability, or "None".
- Source repository: https://github.com/owner/repository
- Official documentation: URL
- License: Exact license identifier and verification source.
- Authentication: None / key required / account required / unknown.
- Cost: Free / limited free tier / unknown; state quotas and caveats.
- Maintenance: Latest release/commit date and project activity evidence.
- Security review: Findings, supply-chain concerns, and unresolved flags.
- Integration opportunity: Concrete way this could compose with another catalogued tool.
- Feasibility: High / Medium / Low, with evidence.
- Status: Candidate / Reviewed / Rejected.

## Research policy

- Prefer public GitHub repositories and open-source projects with verifiable licenses.
- A public repository is not automatically open source; verify the license and dependencies.
- Reject or quarantine projects with unresolved critical security, ownership, malware, credential-exfiltration, or suspicious supply-chain indicators.
- Never store API keys, tokens, personal data, or secrets.
- Do not install, execute, deploy, or invoke discovered tools in this research phase.
- Distinguish verified facts from hypotheses and record the date of each observation.
