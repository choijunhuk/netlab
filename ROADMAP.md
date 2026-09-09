# NetLab delivery ledger

Accepted scope: full protocol simulator plus GitHub PR/review/merge history. Continue autonomously through the sequence below; preserve existing algorithm lab. Do not describe this plan as completed implementation.

| Phase | Deliverable | State |
|---|---|---|
| 0 | Existing repository audit, architecture, contracts, CI | merged #1 |
| 1 | Port editor, document validation, save/load/undo | locally verified; integration PR pending |
| 2 | Deterministic scheduler, real LAN ping, trace | locally verified; integration PR pending |
| 3 | Static routing and two-router ping | locally verified; integration PR pending |
| 4 | Traceroute, runtime failure, header inspection | locally verified; integration PR pending |
| 5 | UDP/TCP handshake/data/close/retry | locally verified; integration PR pending |
| 6 | DHCP/DNS and HTTP lab | locally verified; integration PR pending |
| 7 | NAT/PAT and link conditions | locally verified; integration PR pending |
| 8 | Six examples, autosave, education/accessibility | locally verified; integration PR pending |
| 9 | E2E, review fixes, performance, release | locally verified; integration PR pending |

Parallel lanes after contracts: engine; services; editor; storage/examples. Integrate through independent PRs, then verifier reviews actual combined behavior. Each lane reports changed paths, test evidence, limits and commit. Next sessions read this file, DEVELOPMENT_LOG and GitHub before continuing.

Acceptance evidence: docs/phases/protocol-integration.md (131 tests and 8 browser scenarios). Release is the remaining delivery step; optional protocols and infrastructure remain out of scope.
