# Dependency and baseline decisions

Existing repository: https://github.com/choijunhuk/netlab (public), baseline c296796. It already contains React Flow 12, React 19, Vite 8, Zustand 5, TypeScript 6, Vitest 4 and a lockfile. Reuse this application and preserve legacy behavior instead of creating a competing repository.

Official references: https://reactflow.dev/learn/advanced-use/typescript ; https://vite.dev/guide/ ; https://docs.github.com/en/pull-requests/reference/status-checks . Resolve installed/locked versions rather than inventing version numbers. Keep existing styling/lint tools to avoid unrelated migration. npm ci and current Node verify compatibility; CI uses Node 22 and npm 11 as the existing lockfile requires.

New approved test/validation tools: Playwright browser automation and Zod schemas. The product has no backend and does not call external AI APIs. No additional infrastructure.

Network references to consult during implementation: RFC 826 (ARP), 791/792 (IPv4/ICMP), 768 (UDP), 9293 (TCP), 2131 (DHCP), 1034/1035 (DNS), 3022 (traditional NAT). Models are logical header objects rather than RFC byte serialization; each implemented simplification needs a corresponding protocol note and test.
