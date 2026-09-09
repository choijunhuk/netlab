# Acceptance and test plan

Existing legacy tests remain required. New gates: lint, typecheck, unit tests, integration tests, production build and Playwright browser scenarios.

Core: stable queue, seed determinism, LPM, subnet/mask, ARP cache/miss/retry, MAC learning/flood, independent reverse path, TTL 64->62 across two routers, ICMP time exceeded, no route/gateway, 100% loss, power/link/interface changes, reset invalidation, link bandwidth/queue.

Transport/services: real UDP delivery, TCP handshake, UTF-8 sequence, duplicate suppression, retransmission and timeout, FIN close, DORA/lease/pool exhaustion, DNS A/NXDOMAIN/timeout/cache, PAT mapping and reverse translation.

Document: malformed/version/size/duplicate-ID/dangling-port/invalid-IP rejection without replacing current project; roundtrip complete settings; isolated duplicate addresses vs L2 duplicates; undo/redo and fresh MAC on duplication.

Browser: example ping and manually created PC-switch-PC, IP/route editing, terminal, Step/Pause/Reset/Speed, trace/inspector, protocol controls, save/reload, desktop and narrow viewport, no console errors. Animation evidence must correlate with engine transmissions rather than a decorative path.

Final: six executable examples, seed-controlled performance fixture, repeated reset/cleanup, production preview, fresh main CI and independent review. Record actual totals and any missing acceptance separately.
