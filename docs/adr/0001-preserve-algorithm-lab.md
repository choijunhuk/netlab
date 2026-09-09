# Preserve the original algorithm lab while introducing packet protocols

Status: accepted in foundation PR #1.

The existing public repository already implements Dijkstra shortest paths, a canvas and an educational stop-and-wait reliability loop. Replacing that behavior in place would erase a useful but different lesson and risk existing local scenarios. The new protocol workspace instead gets explicit interfaces, ARP/Ethernet and local IP routing, while the original application stays selectable as a legacy Dijkstra lab.

Both modes remain entirely local; legacy saved scenarios are not silently migrated into an incompatible protocol document. New documents carry schemaVersion 1. Shared UI can be consolidated only after both behavior models have tests; no speculative migration or backend is introduced.
