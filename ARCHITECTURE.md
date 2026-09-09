# NetLab protocol simulator architecture

## Goal and migration
Build the complete educational simulator described in the accepted master prompt. Existing Dijkstra simulator remains available as an explicitly labelled legacy algorithm lab; it is not an IP routing implementation. Existing user checkout and public visibility remain unchanged.

## Stack
Retain React, Vite, TypeScript, React Flow, Zustand, Tailwind and oxlint from the existing repository. Add Playwright and Zod as already approved for browser gates and untrusted project validation. Pin through package-lock. No backend, raw sockets or AI API. CSS for the new workspace is scoped to `.protocol-lab`.

## Layers
`ui/lab` -> `application` -> `core`; `storage` imports contracts only. Core imports no React, browser globals or storage. Scheduler is a stable min heap ordered by virtual microseconds and insertion sequence. Speed changes wall-to-virtual mapping only. Config is cloned into every run; caches, connections, leases and NAT mappings are runtime only.

## Contracts
`src/core/contracts/index.ts` is leader-owned. Interface and physical port share a stable ID in this release. Switch interfaces have no L3 address. Frame and IP identities are distinct. Trace records copy headers so later forwarding cannot mutate history. Scheduler callbacks are runtime-only and are never persisted. A fixed ProtocolExtension interface supports transport/services and NAT at packet boundaries; no general plugin framework.

## Engine API
`src/core/simulation/Simulation.ts` exports `Simulation` implementing SimulationHost. Constructor `(document, extensions = [])`. Public `step(): boolean`, `advanceTo(timeUs, budget=10000): number`, `runUntilIdle(maxEvents=100000, maxTimeUs=60000000): number`, `snapshot(): SimulationSnapshot`, `reset(): void`, `setLinkState(id,up)`, `setInterfaceState(deviceId,interfaceId,up)`, `setPower(deviceId,powered)`. `command` dispatches core commands then extension commands. Core owns ICMP/ARP/routing. `src/application/createSimulation.ts` composes Simulation with `createServicesExtension()` from `core/protocols/services/index.ts`.

## Routing and L2
Local/subnet/gateway route selection uses interface-aware longest prefix match, not global graph paths. Switches learn source MAC and flood unknown/broadcast frames except ingress. L2 cycles are rejected until STP exists. Routers decrement transit TTL and rewrite Ethernet at each hop. Return packets route independently. Queue serialization and propagation latency apply per direction. Loss uses seeded randomness.

## UI and persistence
Editor Document has bounded undo/redo. Structural edits reset the simulation. Runtime failure controls affect the current run. React Flow view data is projected from configuration. Animation derives from Transmission start/arrival and runtime clock. Trace, terminal and tables use snapshots at bounded UI frequency. JSON v1 excludes runtime. Storage validates fully before replacing current Document, with IndexedDB autosave and JSON fallback.

## Ownership and dependency rules
Leader: contracts, root config/lock, application factory, docs, CI and merges. Core agent: core/domain, core/simulation, core/routing, core/diagnostics, core protocol L2/IP/ICMP and own tests. Services agent: core/protocols/services and tests. Editor agent: ui/lab and its components. Storage agent: storage, examples and tests. Integration tests and E2E: leader/verifier. Separate worktrees and PRs; no concurrent shared-file edits. Merge core before services/UI factory integration. Changes to shared API require leader approval inside the team, not another user permission round.

## Verification
Keep existing legacy tests. Add deterministic unit/integration, browser workflows and performance fixtures. Headless success does not prove animation quality; record screenshots and browser errors. Schema import rejection must preserve active document. Phase reports distinguish implemented, verified and merged. No skipped test can count as evidence.

## Simplifications
IPv4 only; no fragmentation, STP, VLAN, real sockets or recursive internet DNS. Educational stop-and-wait TCP with byte sequence, handshake, retransmit and close. DNS A records and same-segment DHCP. PAT with explicit inside/outside and runtime mapping. Protocol limitations are expanded in docs/protocols as implemented.
