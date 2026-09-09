import type { Protocol, TransportPayload } from '../contracts'

/** Educational application labels preserve the underlying UDP transport payload. */
export function protocolLabel(payload: TransportPayload): Protocol {
  if (payload.kind === 'icmp') return 'ICMP'
  if (payload.kind === 'tcp') return 'TCP'
  const ports = [payload.sourcePort, payload.destinationPort]
  if (ports.some((port) => port === 67 || port === 68)) return 'DHCP'
  if (ports.includes(53)) return 'DNS'
  return 'UDP'
}
