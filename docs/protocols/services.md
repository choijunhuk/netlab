# Transport and services

`createServicesExtension()` creates isolated runtime state. The engine calls its reset hook on construction and reset; callbacks from prior generations become inert. All messages use `SimulationHost.sendIp`, including replies, retries, DNS and DHCP. The engine remains responsible for route selection, ARP, Ethernet, loss and delay. Numeric ping belongs to the engine; hostname ping resolves then delegates to that same command.

## Commands and settings

| Command | Behavior |
| --- | --- |
| `udp-send ip port text` | Temporary client port, configured UDP echo listener, reply printed in terminal |
| `tcp-connect ip port` | Starts handshake, prints connection ID |
| `tcp-send connection-id text` | Sends one UTF-8 byte range when established and no range awaits ACK |
| `tcp-close connection-id` | Reliable FIN/ACK exchange, short TIME-WAIT |
| `nslookup hostname` | A lookup using configured interface DNS server |
| `ping hostname` | DNS then engine ICMP command |
| `http-get hostname` | DNS, TCP port 80 handshake, GET and educational HTTP response |
| `dhcp` / `dhcp renew` | DORA transaction; renewal preserves current address until lease expiry |

Device settings: `services.udpEcho`, `services.tcpEcho`, `services.http`; authoritative `dnsRecords`; DHCP `enabled/start/end/prefix/gateway/dns/leaseSeconds`; NAT `enabled/inside/outside` using interface IDs. DHCP mode automatically starts on reset and renews at half the lease duration. The first enabled DHCP interface is the client interface in this release.

## Runtime table contract

Table keys are `tcp:<deviceId>`, `dns:<deviceId>`, `dhcp:<deviceId>`, `nat:<deviceId>`. Cells are strings, numbers or booleans; these are projections, never editable protocol state.

- TCP: `id`, `state`, `localPort`, `remoteIp`, `remotePort`, `sendNext`, `receiveNext`.
- DNS: `hostname`, `address`, `expiresAtUs`.
- DHCP: `client` (MAC), `address`, `expiresAtUs`, `state` (`OFFERED` or `BOUND`). Servers show their pool; clients show their active lease.
- NAT: `protocol`, `insideIp`, `insidePort`, `outsideIp`, `outsidePort`, `remoteIp`, `remotePort`, `expiresAtUs`. ICMP identifiers occupy the port columns.

## Protocol behavior and deliberate bounds

TCP uses a four-tuple connection and stop-and-wait delivery, with UTF-8 byte sequence numbers. SYN and FIN each consume one sequence number. Data is accepted after handshake only, duplicates/out-of-order ranges are ACKed without delivery, and an unacknowledged range retries every virtual second up to three times before timeout. Closed ports send RST. Active close passes through FIN-WAIT-1, FIN-WAIT-2 and TIME-WAIT; peer close uses LAST-ACK. TIME-WAIT is two virtual seconds. This is an educational subset of [RFC 9293](https://www.rfc-editor.org/rfc/rfc9293.html): no congestion control, receive window, segmentation/reassembly, options, sequence wrap, simultaneous open or general half-close API. HTTP serves a fixed text response rather than arbitrary pages.

DNS carries a JSON teaching envelope inside actual UDP port 53 packets, with unique deterministic transaction identity, source/port/name matching, authoritative A responses and NXDOMAIN. Cache entries last 60 virtual seconds; unresolved queries time out at three seconds. There is no recursive resolver, negative caching, compression or binary DNS codec. The relevant DNS structure and A-record concepts are described in [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035.html).

DHCP carries JSON teaching envelopes over real UDP 68/67 broadcast packets. DISCOVER reserves an address for five seconds, REQUEST binds that reservation, and ACK applies runtime interface addressing. Concurrent clients cannot receive the same reserved address. Exhaustion is explicit in the server terminal. A transaction repeats DORA once per second, with three retries; ACK loss reuses the same client's reservation. Renewal also repeats DORA, rather than implementing unicast RENEWING and later REBINDING states. Failed renewal retains the existing lease until its actual expiry, then removes its runtime IP/gateway/DNS. There is no relay, NAK/DECLINE/RELEASE or address-conflict probe. These departures from the full lifecycle in [RFC 2131](https://www.rfc-editor.org/rfc/rfc2131.html) are intentional teaching simplifications.

PAT is endpoint-dependent for TCP, UDP and ICMP echo identifiers. It allocates collision-free public identifiers beginning at 40000, matches the remote peer on reverse traffic, expires after 60 idle virtual seconds, and records deep-copied before/after headers in NAT traces. Only configured outside egress is translated, with source addresses belonging to configured directly connected inside subnets. No hairpinning, static forwarding, nested ICMP error quotation rewriting or full TCP-aware lifetime model is provided. The short, endpoint-dependent behavior is a lab model, not conformance to the full NAT recommendations in [RFC 4787](https://www.rfc-editor.org/rfc/rfc4787.html).

## Verification boundary

The owned tests use a bounded virtual scheduler and a packet-delivery harness implementing `SimulationHost`, with injected loss. They cover UDP demultiplexing, handshake loss, UTF-8 sequence progression, duplicate suppression, data retry, retry exhaustion, RST/FIN close, DNS cache/NXDOMAIN/absence, HTTP over DNS/TCP, automatic DHCP, each DORA packet loss, pool exhaustion, failed renewal expiry, TCP/UDP/ICMP PAT return identity and expiry, and reset isolation. Ethernet/ARP/router integration and browser rendering are separate engine/application gates.
