# Development

Read AGENTS.md, ARCHITECTURE.md and TEST_PLAN.md. Work on a feature branch/worktree. Keep UI/protocol contracts explicit and do not import browser/UI APIs into core. Add a reproduction for protocol bugs and run typecheck, lint, check:core, tests, build and relevant Playwright workflows.

Use intent-first commits with useful Tested/Not-tested/Constraint trailers. Open a PR with behavior, decisions, evidence and known limits; resolve review findings and wait for netlab-quality. Do not bypass branch protection. Record merge SHA after actual merge, not a predicted value. Preserve existing legacy scenarios.

To reproduce browser performance, run a production preview on port4175 then `node scripts/browser-evidence.mjs`. This generates an evidence JSON and screenshots using the committed deterministic 100-router/150-link fixture. Browser evidence is environment-specific.
