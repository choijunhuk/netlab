# Ethernet and IPv4 engine

`Simulation(document, extensions)` clones its input. `reset()` restores that initial configuration, removes all scheduled work/caches/probes/transmissions and resets the seeded random generator. Structural edits require a new Simulation. Runtime power, link and interface changes invalidate previous in-flight frames even if immediately restored.

The virtual scheduler is a stable binary min heap ordered by integer microseconds and insertion sequence. `step()` processes one live event. `advanceTo(target, budget)` stops at the budget without skipping unprocessed events. `runUntilIdle(maxEvents, maxTimeUs)` processes at most the event count and the relative time horizon; future service lease timers remain pending. Defaults are 100,000 events and 60 virtual seconds. All operations are synchronous; animation speed belongs to the application, not protocol execution.

Ethernet switches learn source MACs for 300 seconds and forward known unicast or flood unknown/broadcast to other enabled ports. ARP entries expire after 60 seconds; unresolved neighbors receive three requests one second apart, then pending packets are discarded with an actionable trace. Pending packets are capped at 256 per neighbor. IPv4 route selection includes connected routes, explicit static routes and per-interface default gateways; longest prefix wins, then lowest metric. Disabled interfaces are excluded. Each transit router decrements TTL and chooses its own next hop, ARP mapping and new Ethernet header. Replies independently consult reverse routes. LPM and forwarding traces retain copied pre/post IP headers.

Numeric `ping <IPv4>` sends **one** ICMP echo probe with TTL 64 and a five-second timeout. `traceroute <IPv4>`/`tracert` sends sequential probes with TTL 1 through 30, stopping on echo reply or unreachable. Timeout prints `*` and advances to the next TTL. The default run horizon can leave a long failing traceroute pending; Step/Run continues it. `ipconfig`/`ifconfig`/`ip addr`, `route`/`ip route`, `arp`, and `clear` inspect core state. Unknown commands and hostname ping are offered to extensions.

Links apply serialization (`frame bytes × 8 / Mbps` microseconds), propagation latency, seeded loss and tail drop independently per direction. Queue capacity counts waiting frames in addition to one serializing frame. Payload size is UTF-8 bytes plus educational fixed Ethernet/IP/transport overhead; this is not an exact wire encoding. Loss is sampled once per attempted transmission. History is bounded to 10,000 trace, terminal and transmission records each; the live event queue is capped at 100,000. Link buffers discard invalidated work after failures, and scheduling always remains bounded.

UDP limited broadcast `0.0.0.0 -> 255.255.255.255` can use a selected unconfigured interface for DHCP. Inbound extension hooks run before local-address classification. Outbound hooks run after route/port selection and before ARP; they must not change the egress route. Locally received UDP/TCP is handed to extension `receive`. Extension table rows are cloned and capped at 10,000 per key.

## Public helpers

- `core/domain/ipv4.ts`: `ipv4`, `inSubnet`.
- `core/routing/routes.ts`: `routesFor`, `selectRoute`.
- `core/diagnostics/network.ts`: `diagnose`.
- `core/simulation/EventQueue.ts`: stable cancellable `EventQueue`.

## Deliberate limits

IPv4 only; no fragmentation, VLAN, STP, IPv6, real sockets or dynamic routing. ARP is educational and unauthenticated, not a security boundary. Ethernet loops and duplicate IPs in one segment reject packet execution with diagnostics; isolated segments may reuse addresses. No ICMP errors are generated in response to other ICMP errors or broadcasts. Traceroute uses one probe per TTL; ping count/interval flags and route mutation via terminal are not implemented. Configured gateway addresses must be directly reachable on the selected interface; recursive next-hop resolution is not simulated. Runtime power changes invalidate traffic and core neighbor caches; extension-specific leases and connections follow their own timeout/reset policy.

Verification uses independent fixtures for two-router TTL 62, missing reverse routes, ARP cache/aging/retry, switch learning, traceroute, ICMP unreachable, deterministic Step execution, 100% loss, full-duplex/taildrop, DHCP broadcast, extension ordering, failures, reset and 100,000 scheduled events. Browser rendering and service protocol correctness belong to their separate integration gates.
