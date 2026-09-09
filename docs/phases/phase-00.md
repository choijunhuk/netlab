# Phase 0 — foundation

Baseline: c296796, existing public repository reused; no new repository or visibility change. Isolated worktree protects original .omc changes.

Changes: architecture, requirements archive, design brief, delivery ledger, test plan, core contracts, PR template, quality CI, strict app TypeScript, Zod and Playwright dependencies. Existing Tailwind and oxlint retained deliberately. Lockfile security patches resolve four initial advisories; npm audit now reports zero.

Verified: npm run typecheck; npm run lint; npm test (7 files, 32 tests); npm run build — all passed locally. Independent foundation review found no blocker. Integration/E2E suites are not present yet and are not claimed to pass. Existing legacy UI remains the visible application at this phase.

Next: engine, transport/services, protocol editor and storage/examples in isolated worktrees. CI/merge confirmation is recorded on the PR and in the following phase log.
