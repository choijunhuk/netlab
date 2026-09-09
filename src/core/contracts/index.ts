/** Persisted configuration is separate from each simulation run's mutable state. */
export type DeviceKind = 'pc' | 'server' | 'switch' | 'router'
export interface InterfaceConfig {
  id: string
  name: string
  mac: string
  ip?: string
  prefix?: number
  gateway?: string
  dns?: string
  mode: 'static' | 'dhcp'
  up: boolean
}
export interface RoutingEntry { network: string; prefix: number; gateway?: string; interfaceId: string; metric: number }
export interface DHCPConfig { enabled: boolean; start: string; end: string; prefix: number; gateway: string; dns: string; leaseSeconds: number }
export interface NATConfig { enabled: boolean; inside: string[]; outside: string }
export interface DeviceConfig {
  id: string
  name: string
  kind: DeviceKind
  position: { x: number; y: number }
  powered: boolean
  /** A physical Ethernet port and its logical interface share this stable ID. */
  interfaces: InterfaceConfig[]
  routes: RoutingEntry[]
  dhcp?: DHCPConfig
  dnsRecords?: Record<string, string>
  services?: { udpEcho?: number; tcpEcho?: number; http?: boolean }
  nat?: NATConfig
}
export interface LinkConfig {
  id: string
  a: { deviceId: string; interfaceId: string }
  b: { deviceId: string; interfaceId: string }
  latencyMs: number
  bandwidthMbps: number
  lossPercent: number
  queueCapacity: number
  up: boolean
}
export interface NetworkDocument {
  schemaVersion: 1
  name: string
  seed: number
  devices: DeviceConfig[]
  links: LinkConfig[]
}
export type Protocol = 'ARP' | 'ICMP' | 'UDP' | 'TCP' | 'DHCP' | 'DNS' | 'Routing' | 'System'
export interface ARPMessage { kind: 'arp'; operation: 'request' | 'reply'; senderIp: string; senderMac: string; targetIp: string; targetMac?: string }
export interface ICMPMessage { kind: 'icmp'; type: 'echo-request' | 'echo-reply' | 'time-exceeded' | 'unreachable'; identifier: string; sequence: number; original?: { source: string; destination: string; identifier: string; sequence: number }; data: string }
export interface UDPMessage { kind: 'udp'; sourcePort: number; destinationPort: number; data: string }
export interface TCPMessage { kind: 'tcp'; sourcePort: number; destinationPort: number; sequence: number; acknowledgment: number; flags: Array<'SYN' | 'ACK' | 'FIN' | 'RST'>; data: string }
export type TransportPayload = ICMPMessage | UDPMessage | TCPMessage
export interface IPv4Packet { id: string; source: string; destination: string; ttl: number; payload: TransportPayload; flowId: string }
export interface EthernetFrame { id: string; source: string; destination: string; etherType: 'ARP' | 'IPv4'; payload: ARPMessage | IPv4Packet }
export interface TraceRecord {
  id: string
  runId: string
  timeUs: number
  protocol: Protocol
  type: string
  message: string
  deviceId?: string
  interfaceId?: string
  linkId?: string
  packetId?: string
  flowId?: string
  reason?: string
  frame?: EthernetFrame
  before?: IPv4Packet
  after?: IPv4Packet
}
export interface Transmission { id: string; linkId: string; fromDeviceId: string; toDeviceId: string; startUs: number; arrivalUs: number; protocol: Protocol; frame: EthernetFrame }
export interface TerminalLine { id: string; deviceId: string; timeUs: number; text: string }
export interface ARPEntry { interfaceId: string; ip: string; mac: string; expiresAtUs: number }
export interface MACEntry { mac: string; interfaceId: string; expiresAtUs: number }
export interface Diagnostic { code: string; message: string; deviceId?: string; interfaceId?: string }
export interface SimulationSnapshot {
  nowUs: number
  pendingEvents: number
  trace: TraceRecord[]
  terminal: TerminalLine[]
  transmissions: Transmission[]
  arp: Record<string, ARPEntry[]>
  mac: Record<string, MACEntry[]>
  /** Read-only projections, never protocol state owned by the UI. */
  tables: Record<string, Array<Record<string, string | number | boolean>>>
  devices: DeviceConfig[]
  links: LinkConfig[]
}
export interface SendOptions { ttl?: number; sourceIp?: string; interfaceId?: string; flowId?: string }
export interface ProtocolExtension {
  receive(host: SimulationHost, deviceId: string, packet: IPv4Packet, interfaceId: string): boolean
  command?(host: SimulationHost, deviceId: string, text: string): boolean
  reset?(host: SimulationHost): void
  /** NAT hooks run before routing/local delivery and before output respectively. */
  inbound?(host: SimulationHost, deviceId: string, packet: IPv4Packet, interfaceId: string): IPv4Packet
  outbound?(host: SimulationHost, deviceId: string, packet: IPv4Packet, interfaceId: string): IPv4Packet
}
export interface SimulationHost {
  readonly nowUs: number
  readonly document: NetworkDocument
  id(prefix: string): string
  schedule(delayUs: number, action: () => void): () => void
  sendIp(deviceId: string, destination: string, payload: TransportPayload, options?: SendOptions): void
  trace(record: Omit<TraceRecord, 'id' | 'runId' | 'timeUs'>): void
  print(deviceId: string, text: string): void
  setTable(key: string, rows: Array<Record<string, string | number | boolean>>): void
  command(deviceId: string, text: string): void
}
