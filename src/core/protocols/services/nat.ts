import type { IPv4Packet, SimulationHost } from '../../contracts'

const SECOND = 1_000_000
const ipNumber = (s: string) => s.split('.').reduce((n, v) => n * 256 + Number(v), 0)
interface Mapping {
  protocol: string
  insideIp: string
  insidePort: string
  outsideIp: string
  outsidePort: string
  remoteIp: string
  remotePort: string
  expiresAtUs: number
}

/** Endpoint-dependent educational PAT. Mapping lifetime belongs to this run. */
export function createNatState(
  later: (h: SimulationHost, delay: number, fn: () => void) => void,
  tables: (h: SimulationHost, id: string) => void,
) {
  const mappings = new Map<string, Mapping[]>()
  const device = (h: SimulationHost, id: string) => h.document.devices.find((d) => d.id === id)!
  const translate = (
    h: SimulationHost,
    id: string,
    packet: IPv4Packet,
    iface: string,
    inbound: boolean,
  ): IPv4Packet => {
    const d = device(h, id)
    const n = d.nat
    if (!n?.enabled) return packet
    let rows = mappings.get(id) ?? []
    rows = rows.filter((m) => m.expiresAtUs > h.nowUs)
    mappings.set(id, rows)
    const p = packet.payload
    const protocol = p.kind
    const source = p.kind === 'icmp' ? p.identifier : String(p.sourcePort)
    const dest = p.kind === 'icmp' ? p.identifier : String(p.destinationPort)
    let m: Mapping | undefined
    if (inbound) {
      if (iface !== n.outside) return packet
      m = rows.find(
        (m) =>
          m.protocol === protocol &&
          m.outsideIp === packet.destination &&
          m.outsidePort === dest &&
          m.remoteIp === packet.source &&
          (p.kind === 'icmp' || m.remotePort === source),
      )
      if (!m) return packet
    } else {
      if (iface !== n.outside) return packet
      const inside = d.interfaces.filter((i) => n.inside.includes(i.id))
      const sourceNumber = ipNumber(packet.source)
      if (
        !inside.some(
          (i) =>
            i.ip &&
            i.prefix !== undefined &&
            Math.floor(sourceNumber / 2 ** (32 - i.prefix)) ===
              Math.floor(ipNumber(i.ip) / 2 ** (32 - i.prefix)),
        )
      )
        return packet
      m = rows.find(
        (m) =>
          m.protocol === protocol &&
          m.insideIp === packet.source &&
          m.insidePort === source &&
          m.remoteIp === packet.destination &&
          m.remotePort === dest,
      )
      if (!m) {
        const outsideIp = d.interfaces.find((i) => i.id === n.outside)?.ip
        if (!outsideIp) return packet
        let outsidePort = 40000
        while (rows.some((r) => r.protocol === protocol && r.outsidePort === String(outsidePort)))
          outsidePort++
        if (outsidePort > 65535) return packet
        m = {
          protocol,
          insideIp: packet.source,
          insidePort: source,
          outsideIp,
          outsidePort: String(outsidePort),
          remoteIp: packet.destination,
          remotePort: dest,
          expiresAtUs: 0,
        }
        rows.push(m)
      }
    }
    m.expiresAtUs = h.nowUs + 60 * SECOND
    const expiry = m.expiresAtUs
    const mapping = m
    later(h, 60 * SECOND, () => {
      if (mapping.expiresAtUs === expiry) {
        mappings.set(
          id,
          (mappings.get(id) ?? []).filter((v) => v !== mapping),
        )
        tables(h, id)
      }
    })
    const result: IPv4Packet = { ...packet, payload: { ...p } }
    if (inbound) {
      result.destination = m.insideIp
      if (result.payload.kind === 'icmp') result.payload.identifier = m.insidePort
      else result.payload.destinationPort = Number(m.insidePort)
    } else {
      result.source = m.outsideIp
      if (result.payload.kind === 'icmp') result.payload.identifier = m.outsidePort
      else result.payload.sourcePort = Number(m.outsidePort)
    }
    h.trace({
      deviceId: id,
      interfaceId: iface,
      protocol: p.kind === 'icmp' ? 'ICMP' : p.kind === 'tcp' ? 'TCP' : 'UDP',
      type: 'nat',
      message: inbound ? 'PAT reverse translation' : 'PAT source translation',
      before: structuredClone(packet),
      after: structuredClone(result),
    })
    tables(h, id)
    return result
  }
  return {
    translate,
    reset: () => mappings.clear(),
    rows: (id: string) => (mappings.get(id) ?? []).map((m) => ({ ...m })),
  }
}
