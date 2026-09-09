# Independent reviews and fixes

Reviews were performed by native agents, not represented as independent human GitHub approvals.

| Area | Finding | Resolution / regression |
|---|---|---|
| Foundation | No blocking finding; runtime still pending | #1 CI and 32 tests |
| Storage | New device ID could collide with imported link ID | occupiedIds argument, pc2/pc2-eth0 regressions; #2 |
| Core | Receiver failure left upstream queue reservations | Both link directions cleared, immediate recovery tests |
| Services | Second echo request silently lost while first reply unacknowledged | Receiver backpressure and loss regression |
| UDP | DNS-shaped JSON hijacked arbitrary echo payload | Port-aware dispatch; DNS/DHCP echo regressions |
| Routing UI | Gateway default route omitted | Read-only application projection reuses routesFor |
| Animation | Invalidated frames remained active | Immediate invalidation and expiry, core and browser tests |
| React Flow | Measured sizes discarded; nodes remained hidden | Preserve measurements, browser manual-edit regression |
| React Flow | Initial Fit View ran before all node dimensions | Fit after initialization; all six bounds asserted |
| React Flow | 100 per-node internals updates caused React185 | Parent batches document measurements; large import regression |
| Navigation | Dijkstra switch unmounted unsaved protocol workspace | Preserve mounted workspace and pause on inactive; E2E |
| DNS | Uppercase configured names returned NXDOMAIN | Normalize names and terminal dots; regression |
| Switch | Empty ports generated false packet-drop records | Only forward through operational attached links; regression |

Scoped re-reviews verified fixes. Final UI/CI review found no remaining blocking findings after mode preservation and batched measurements. Browser evidence was produced by the leader, not claimed to have been rerun by read-only reviewers.
