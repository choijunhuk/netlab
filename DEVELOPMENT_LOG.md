# Development log

## Protocol simulator expansion — foundation
- Request: implement the accepted NetLab master prompt and maintain GitHub PR/merge history without repeated permission handoffs.
- Found existing public choijunhuk/netlab at c296796, with legacy Dijkstra/UDP/TCP lab. Existing checkout has unrelated .omc state modifications; left untouched.
- Work happens in isolated delivery and agent worktrees. Existing visibility and deployment configuration retained.
- Decision: preserve legacy algorithm mode; add accurate protocol mode behind a separate application boundary. Retain existing Tailwind/oxlint rather than unrelated migrations.
- Added architecture, test plan, phase ledger and explicit engine/service/UI contracts before implementation.
- Validation: baseline gates and foundation CI results will be recorded with the PR.
- Status: implementation not yet complete.

## Foundation merged
- PR: https://github.com/choijunhuk/netlab/pull/1
- Merge: c7834b711a99f117f4edb31a45f02e8054eb26a6 at 2026-09-09T08:17:44Z.
- CI: https://github.com/choijunhuk/netlab/actions/runs/34328259083; netlab-quality passed.
- Local: 32/32 existing tests; strict app typecheck, lint, build; audit zero vulnerabilities.
- Independent review: no blocking foundation findings; runtime and E2E explicitly pending.
- Enabled strict required netlab-quality branch protection, admin enforcement, no force push/deletion.
- Four isolated implementation lanes started: network core, transport/services, protocol UI, storage/examples.

## Storage, network and services merged
- #2 https://github.com/choijunhuk/netlab/pull/2 — a03498ec41f1367af46cf7763aaa81d012d1ec51, 2026-09-09T08:28:30Z; storage and examples, 51 tests.
- #3 https://github.com/choijunhuk/netlab/pull/3 — cd77d16321cfa680b18c44db784f92b8334afc65, 2026-09-09T08:33:11Z; Ethernet/ARP/IP scheduler, 75 combined tests.
- #4 https://github.com/choijunhuk/netlab/pull/4 — 0c4f9faff4e29dc87530fdc9e5726f49ecb60ac8, 2026-09-09T09:06:47Z; transport/services, reviewed loss and demultiplexing fixes.

## Final integration and browser verification
- Integrated real port workspace, persistence, runtime composition and legacy mode navigation.
- Fixed reviewer findings for route projection, failure animation, DNS case normalization and empty Switch ports.
- Browser tests exposed discarded React Flow measurements and an initial fit race; corrected both. Large import exposed per-node internals update recursion, fixed with a batch update. Mode switching now preserves unsaved edits.
- Fresh local gates: 131 tests, 8 Chromium E2E scenarios, strict typecheck, lint, core boundaries and production build passed.
- Stress evidence: 100 devices, 150 links, 20/20 replies, zero browser errors; environment-specific metrics and screenshots committed.
- Full implementation/review evidence and known simplifications are documented. Integration PR and final release remain pending until their actual GitHub confirmation.

## Integration merged; release preparation
- PR #5: https://github.com/choijunhuk/netlab/pull/5
- Merge SHA: 2ebaf4cd64f22a23f67bcd947649b24cd209b481 at 2026-09-09T17:05:24Z.
- CI: https://github.com/choijunhuk/netlab/actions/runs/34380623648 — netlab-quality passed in57s including production Chromium workflows.
- Version1.0.0 package and lockfile metadata prepared; fresh merged-code typecheck and131 tests passed.
- Release PR records final status; its actual merge SHA and the tag target are recorded in the PR comment/GitHub Release, avoiding recursive documentation commits.
