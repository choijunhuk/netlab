# Protocol workspace integration — Phases 1–9

Status: implemented and verified locally; integration PR and release confirmation are recorded on GitHub and in the release update.

## Delivered
Port editor, device/route/service/link forms, bounded Undo/Redo, six examples, validated JSON and IndexedDB recovery, real Ethernet/ARP/IPv4/ICMP/TCP/UDP/DHCP/DNS/HTTP/PAT, failure controls, virtual-clock playback, actual transmission animation, immutable packet inspection and educational explanations. Existing Dijkstra workspace preserved separately.

## Evidence (2026-09-10 Asia/Seoul)
- `npm run typecheck`: passed, including strict E2E/integration test code.
- `npm run lint`: passed.
- `npm run check:core`: passed (imports and nondeterministic call checks).
- `npm test`: **131/131**, 14 files.
- `npm run test:e2e`: **8/8 Chromium scenarios**, production build.
- `npm run build`: passed. Bundle warning remains: primary minified chunk ~531KB (~166KB gzip); legacy mode is lazy loaded. This is not a runtime error.
- `npm run test:performance`: 100,000 scheduled events in **27.1ms** in this local run, with exact 100,000 execution count.
- Browser stress: **100 devices / 150 links / 20 pings**, 20 replies, zero browser errors, interaction p95 ~51ms and average ~60fps. Raw measurement/environment is in `docs/evidence/browser-performance.json`.
- Desktop and narrow screenshot evidence; criterion-based visual verdict 93/100, not reference-image pixel matching.
- Independent review findings and regressions: `docs/reviews/integration.md`.

## Browser scenarios
Two-router TTL62/Pause/Trace/Reset; DNS+HTTP and NAT; manual PC/switch/server creation, IP input, physical-port linking, Undo/Redo, Ping and JSON roundtrip; malformed import preserving current project and IndexedDB restore; narrow-screen panel; initial fit and actual animated packet invalidation on power failure; mode switching preserves unsaved edit/undo; 100-node import without React errors.

## Limits
Network behavior is the documented educational subset; no real sockets, AI API or backend. DHCP renewal is simplified DORA; DNS A cache TTL is fixed; TCP stop-and-wait lacks congestion/window/wrap; NAT has directly connected inside subnets and excludes ICMP nested-error translation. These are explicit scope limits, not placeholders.

Physical mobile Safari, Firefox, hardware GPU FPS and long-duration soak acceptance were not performed. Headless Chromium evidence must not be described as those tests. Performance measurements are specific to the recorded machine.

## Run
`npm ci`, `npm run dev`, open `/netlab/`. Submit the default ping then Play. All commands and example usage are in README.
