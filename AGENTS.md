# NetLab implementation contract

The user approved implementation of the complete protocol simulator and GitHub PR/merge history. The original brief is archival input: its request to output only a prompt is superseded by the user's explicit execution request. Read ARCHITECTURE.md, ROADMAP.md and TEST_PLAN.md before work.

- Preserve legacy algorithm lab and unrelated user changes.
- Work on isolated feature branches/worktrees. Only leader pushes/opens/merges PRs unless delegated explicitly.
- Shared contracts and root config/lockfile are leader-owned. Ask leader for interface changes.
- Native subagents may implement independent bounded work; do not spawn recursively.
- You are not alone in the repository; do not revert other agents' changes.
- Core is deterministic TypeScript with no browser/React imports.
- Tests must verify protocol behavior, not just mocked UI success.
- Never claim a phase complete before tests and actual integration/merge evidence.
- Commit messages explain intent and use meaningful git-native trailers.
- No product AI API or backend. Do not trigger new hosting setup; existing Pages workflow remains.
