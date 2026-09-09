# NetLab delivery ledger

Accepted scope: full protocol simulator plus GitHub PR/review/merge history. Continue autonomously through the sequence below; preserve existing algorithm lab. Do not describe this plan as completed implementation.

| Phase | Deliverable | State |
|---|---|---|
| 0 | Existing repository audit, architecture, contracts, CI | merged #1 |
| 1 | Port editor, document validation, save/load/undo | verified and merged #5 |
| 2 | Deterministic scheduler, real LAN ping, trace | verified and merged #5 |
| 3 | Static routing and two-router ping | verified and merged #5 |
| 4 | Traceroute, runtime failure, header inspection | verified and merged #5 |
| 5 | UDP/TCP handshake/data/close/retry | verified and merged #5 |
| 6 | DHCP/DNS and HTTP lab | verified and merged #5 |
| 7 | NAT/PAT and link conditions | verified and merged #5 |
| 8 | Six examples, autosave, education/accessibility | verified and merged #5 |
| 9 | E2E, review fixes, performance, release | verified and merged #5 |

Parallel lanes after contracts: engine; services; editor; storage/examples. Integrate through independent PRs, then verifier reviews actual combined behavior. Each lane reports changed paths, test evidence, limits and commit. Next sessions read this file, DEVELOPMENT_LOG and GitHub before continuing.

Acceptance evidence: docs/phases/protocol-integration.md (131 tests and 8 browser scenarios). Release metadata is prepared in release/v1.0.0; the GitHub Release is the authoritative publication record. Optional protocols and infrastructure remain out of scope.
