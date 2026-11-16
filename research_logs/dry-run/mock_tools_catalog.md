# Discovery Dry-Run — Mock Catalog

- Date: 2026-11-16
- Capability: Open-source zero-cost OCR
- Mode: Offline mocked dry-run; no external GitHub API request was issued.
- Request budget: exactly 5 mocked request events.
- Result: No candidate admitted to the catalog.

## Why no candidate was admitted

The dry-run validates the quality gates and output contract, not third-party repository claims. No live repository files, license text, commit history, dependency manifests, or `.env.example` files were fetched. Therefore there is no source-backed verification snippet and no candidate can be marked verified.

## Pipeline acceptance contract

Every future accepted entry must include:
- Exact GitHub repository URL.
- README and at least one structural signal (tests directory, API documentation, or configuration manifest).
- Last-commit evidence within 12 months.
- Fork comparison evidence when applicable; a fork is rejected unless ahead commits and unique commits are verified.
- License identifier and evidence.
- Dependency manifest and `.env.example` cost assessment.
- A source path, exact evidence snippet, and evidence URL.
- Conservative integration feasibility assessment for serverless/client-side execution.

## Mock request ledger

| # | Mock request | Purpose |
|---:|---|---|
| 1 | repository search fixture | OCR capability discovery |
| 2 | repository metadata fixture | fork/activity metadata |
| 3 | root contents fixture | README and structure |
| 4 | manifest fixture | dependency screening |
| 5 | environment template fixture | commercial key screening |

All five events are synthetic test fixtures. They are not GitHub API calls and do not consume GitHub quota.
