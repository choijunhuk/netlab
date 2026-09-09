import { describe, it, expect } from 'vitest'
import { createServicesExtension } from './index'
import type {
  DeviceConfig,
  IPv4Packet,
  NetworkDocument,
  SimulationHost,
  TransportPayload,
} from '../../contracts'
const pc = (id: string, ip: string): DeviceConfig => ({
  id,
  name: id,
  kind: 'pc',
  position: { x: 0, y: 0 },
  powered: true,
  routes: [],
  interfaces: [{ id: `${id}-if`, name: 'eth0', mac: id, ip, prefix: 24, mode: 'static', up: true }],
})
function harness(devices: DeviceConfig[]) {
  const ext = createServicesExtension()
  let now = 0,
    counter = 0
  const queue: Array<{ at: number; fn: () => void }> = []
  const lines: string[] = []
  const sent: IPv4Packet[] = []
  const tables: Record<string, Array<Record<string, string | number | boolean>>> = {}
  let drop: ((p: IPv4Packet) => boolean) | undefined
  const document: NetworkDocument = { schemaVersion: 1, name: 'test', seed: 1, devices, links: [] }
  const host: SimulationHost = {
    document,
    get nowUs() {
      return now
    },
    id: (p) => `${p}-${++counter}`,
    schedule(delay, fn) {
      const e = { at: now + delay, fn }
      queue.push(e)
      return () => {
        const i = queue.indexOf(e)
        if (i >= 0) queue.splice(i, 1)
      }
    },
    sendIp(id, destination, payload, options) {
      const source =
        options?.sourceIp ?? devices.find((d) => d.id === id)!.interfaces[0].ip ?? '0.0.0.0'
      const p: IPv4Packet = {
        id: String(++counter),
        source,
        destination,
        payload: structuredClone(payload),
        ttl: 64,
        flowId: 'f',
      }
      sent.push(p)
      if (drop?.(p)) return
      for (const d of devices.filter(
        (d) =>
          d.id !== id &&
          (destination === '255.255.255.255' || d.interfaces.some((i) => i.ip === destination)),
      ))
        host.schedule(100, () => ext.receive(host, d.id, p, d.interfaces[0].id))
    },
    trace() {},
    print(id, s) {
      lines.push(`${id}: ${s}`)
    },
    setTable(k, v) {
      tables[k] = v
    },
    command(id, s) {
      ext.command?.(host, id, s)
    },
  }
  const advance = (until: number) => {
    let steps = 0
    while (queue.some((e) => e.at <= until)) {
      queue.sort((a, b) => a.at - b.at)
      const e = queue.shift()!
      now = e.at
      e.fn()
      if (++steps > 10000) throw Error('event loop')
    }
    now = until
  }
  return {
    host,
    ext,
    lines,
    sent,
    tables,
    advance,
    setDrop(fn: (p: IPv4Packet) => boolean) {
      drop = fn
    },
  }
}
describe('transport and services packet state machines', () => {
  it('demultiplexes UDP echo and ignores unopened ports', () => {
    const a = pc('a', '10.0.0.1'),
      b = pc('b', '10.0.0.2')
    b.services = { udpEcho: 7 }
    const h = harness([a, b])
    h.host.command('a', 'udp-send 10.0.0.2 7 hello')
    h.host.command('a', 'udp-send 10.0.0.2 8 absent')
    h.advance(1000)
    expect(h.lines.filter((s) => s.includes('UDP reply'))).toEqual(['a: UDP reply: hello'])
    expect(h.sent).toHaveLength(4)
  })
  it('handshakes, counts UTF8 bytes, suppresses retransmitted data, and closes', () => {
    const a = pc('a', '10.0.0.1'),
      b = pc('b', '10.0.0.2')
    b.services = { tcpEcho: 7 }
    const h = harness([a, b])
    h.host.command('a', 'tcp-connect 10.0.0.2 7')
    h.advance(1000)
    const id = String(h.tables['tcp:a'][0].id)
    expect(h.tables['tcp:a'][0].state).toBe('ESTABLISHED')
    let dropped = false
    h.setDrop((p) => {
      if (
        !dropped &&
        p.source === b.interfaces[0].ip &&
        p.payload.kind === 'tcp' &&
        p.payload.acknowledgment === 1007
      ) {
        dropped = true
        return true
      }
      return false
    })
    h.host.command('a', `tcp-send ${id} 한글`)
    h.advance(2_000_000)
    expect(h.tables['tcp:a'][0].sendNext).toBe(1007)
    expect(h.lines.filter((s) => s.startsWith('b:') && s.includes('received: 한글'))).toHaveLength(
      1,
    )
    h.host.command('a', `tcp-close ${id}`)
    h.advance(5_000_000)
    expect(h.tables['tcp:a'][0].state).toBe('CLOSED')
    expect(h.tables['tcp:b'][0].state).toBe('CLOSED')
  })
  it('retries a lost SYN and fails after a bounded retry limit', () => {
    const h = harness([pc('a', '10.0.0.1'), pc('b', '10.0.0.2')])
    h.setDrop(() => true)
    h.host.command('a', 'tcp-connect 10.0.0.2 7')
    h.advance(5_000_000)
    expect(h.sent).toHaveLength(4)
    expect(h.tables['tcp:a'][0].state).toBe('TIMED-OUT')
  })
  it('recovers from a lost final handshake ACK', () => {
    const b = pc('b', '10.0.0.2')
    b.services = { tcpEcho: 7 }
    const h = harness([pc('a', '10.0.0.1'), b])
    let dropped = false
    h.setDrop((p) => {
      if (
        !dropped &&
        p.source === '10.0.0.1' &&
        p.payload.kind === 'tcp' &&
        p.payload.flags.join() === 'ACK'
      ) {
        dropped = true
        return true
      }
      return false
    })
    h.host.command('a', 'tcp-connect 10.0.0.2 7')
    h.advance(2_000_000)
    expect(h.tables['tcp:b'][0].state).toBe('ESTABLISHED')
  })
  it('resolves A records, caches, reports NXDOMAIN and missing DNS timeout', () => {
    const a = pc('a', '10.0.0.1'),
      b = pc('b', '10.0.0.2')
    a.interfaces[0].dns = '10.0.0.2'
    b.dnsRecords = { 'test.local': '10.0.0.3' }
    const h = harness([a, b])
    h.host.command('a', 'nslookup test.local')
    h.advance(1000)
    expect(h.tables['dns:a'][0].address).toBe('10.0.0.3')
    h.host.command('a', 'nslookup test.local')
    expect(h.sent).toHaveLength(2)
    h.host.command('a', 'nslookup absent.local')
    h.advance(2000)
    expect(h.lines.some((s) => s.includes('NXDOMAIN'))).toBe(true)
    a.interfaces[0].dns = '10.0.0.99'
    h.host.command('a', 'nslookup timeout.local')
    h.advance(4_000_000)
    expect(h.lines.some((s) => s.includes('DNS timeout'))).toBe(true)
  })
  it('allocates DORA reservations, prevents pool duplication, renews and expires', () => {
    const a = pc('a', '0.0.0.0'),
      b = pc('b', '0.0.0.0'),
      server = pc('s', '10.0.0.1')
    a.interfaces[0].mode = b.interfaces[0].mode = 'dhcp'
    server.dhcp = {
      enabled: true,
      start: '10.0.0.10',
      end: '10.0.0.10',
      prefix: 24,
      gateway: '10.0.0.1',
      dns: '10.0.0.1',
      leaseSeconds: 10,
    }
    const h = harness([a, b, server])
    h.host.command('a', 'dhcp')
    h.host.command('b', 'dhcp')
    h.advance(1000)
    expect(a.interfaces[0].ip).toBe('10.0.0.10')
    expect(b.interfaces[0].ip).toBe('0.0.0.0')
    expect(h.lines.some((s) => s.includes('exhausted'))).toBe(true)
    h.advance(5_000_000)
    h.host.command('a', 'dhcp renew')
    h.advance(5_001_000)
    h.advance(11_000_000)
    expect(a.interfaces[0].ip).toBe('10.0.0.10')
    h.setDrop(() => true)
    h.advance(22_000_000)
    expect(a.interfaces[0].ip).toBeUndefined()
    expect(h.tables['dhcp:s']).toEqual([])
  })
  it('PAT prevents UDP port collisions and reverses only matching peer traffic', () => {
    const router = pc('r', '10.0.0.1')
    router.interfaces.push({ ...router.interfaces[0], id: 'wan', ip: '203.0.113.1' })
    router.nat = { enabled: true, inside: ['r-if'], outside: 'wan' }
    const h = harness([router])
    const packet = (source: string, payload: TransportPayload): IPv4Packet => ({
      id: source,
      source,
      destination: '198.51.100.1',
      ttl: 64,
      flowId: 'f',
      payload,
    })
    const one = h.ext.outbound!(
      h.host,
      'r',
      packet('10.0.0.2', { kind: 'udp', sourcePort: 1234, destinationPort: 7, data: 'a' }),
      'wan',
    )
    const two = h.ext.outbound!(
      h.host,
      'r',
      packet('10.0.0.3', { kind: 'udp', sourcePort: 1234, destinationPort: 7, data: 'b' }),
      'wan',
    )
    expect(one.source).toBe('203.0.113.1')
    expect(one.payload).not.toEqual(two.payload)
    const response = {
      ...one,
      source: '198.51.100.1',
      destination: one.source,
      payload: {
        kind: 'udp' as const,
        sourcePort: 7,
        destinationPort: (one.payload as { sourcePort: number }).sourcePort,
        data: 'a',
      },
    }
    expect(h.ext.inbound!(h.host, 'r', response, 'wan').destination).toBe('10.0.0.2')
    expect(
      h.ext.inbound!(h.host, 'r', { ...response, source: '198.51.100.99' }, 'wan').destination,
    ).toBe('203.0.113.1')
    h.advance(61_000_000)
    expect(h.tables['nat:r']).toEqual([])
    expect(h.ext.inbound!(h.host, 'r', response, 'wan').destination).toBe('203.0.113.1')
  })
  it('isolates instances and resets pending callbacks', () => {
    const h = harness([pc('a', '10.0.0.1')])
    h.host.command('a', 'tcp-connect 10.0.0.2 7')
    h.ext.reset!(h.host)
    h.advance(10_000_000)
    expect(h.tables['tcp:a']).toEqual([])
    expect(h.sent).toHaveLength(1)
    const other = harness([pc('a', '10.0.0.1')])
    expect(other.tables).toEqual({})
  })
})

describe('loss, automatic configuration, and application integration', () => {
  it('retransmits the original byte range without delivering duplicate data', () => {
    const b = pc('b', '10.0.0.2')
    b.services = { tcpEcho: 7 }
    const h = harness([pc('a', '10.0.0.1'), b])
    h.host.command('a', 'tcp-connect 10.0.0.2 7')
    h.advance(1000)
    const id = String(h.tables['tcp:a'][0].id)
    h.setDrop((p) => p.source === '10.0.0.2' && h.host.nowUs < 500_000)
    h.host.command('a', `tcp-send ${id} retry me`)
    h.advance(2_000_000)
    expect(
      h.sent.filter(
        (p) => p.source === '10.0.0.1' && p.payload.kind === 'tcp' && p.payload.data === 'retry me',
      ),
    ).toHaveLength(2)
    expect(
      h.lines.filter((s) => s.startsWith('b:') && s.includes('received: retry me')),
    ).toHaveLength(1)
    expect(
      h.lines.filter((s) => s.startsWith('a:') && s.includes('received: retry me')),
    ).toHaveLength(1)
  })
  it('closed TCP ports return RST and abort the client retry', () => {
    const h = harness([pc('a', '10.0.0.1'), pc('b', '10.0.0.2')])
    h.host.command('a', 'tcp-connect 10.0.0.2 80')
    h.advance(5_000_000)
    expect(h.tables['tcp:a'][0].state).toBe('CLOSED')
    expect(h.sent).toHaveLength(2)
    expect(h.sent[1].payload.kind === 'tcp' && h.sent[1].payload.flags.includes('RST')).toBe(true)
  })
  it('fetches HTTP through DNS and a TCP handshake', () => {
    const a = pc('a', '10.0.0.1'),
      b = pc('b', '10.0.0.2')
    a.interfaces[0].dns = '10.0.0.2'
    b.dnsRecords = { 'web.local': '10.0.0.2' }
    b.services = { http: true }
    const h = harness([a, b])
    h.host.command('a', 'http-get web.local')
    h.advance(5000)
    expect(h.lines.some((s) => s.startsWith('a:') && s.includes('HTTP/1.0 200 OK'))).toBe(true)
    expect(h.sent.some((p) => p.payload.kind === 'udp' && p.payload.destinationPort === 53)).toBe(
      true,
    )
    expect(h.sent.some((p) => p.payload.kind === 'tcp' && p.payload.data.startsWith('GET /'))).toBe(
      true,
    )
  })
  it('automatically acquires after reset and renews halfway through the lease', () => {
    const a = pc('a', '0.0.0.0'),
      s = pc('s', '10.0.0.1')
    a.interfaces[0].mode = 'dhcp'
    s.dhcp = {
      enabled: true,
      start: '10.0.0.10',
      end: '10.0.0.20',
      prefix: 24,
      gateway: '10.0.0.1',
      dns: '10.0.0.1',
      leaseSeconds: 10,
    }
    const h = harness([a, s])
    h.ext.reset!(h.host)
    h.advance(1000)
    expect(a.interfaces[0].ip).toBe('10.0.0.10')
    const expiry = h.tables['dhcp:a'][0].expiresAtUs
    h.advance(6_000_000)
    expect(h.tables['dhcp:a'][0].expiresAtUs).toBeGreaterThan(Number(expiry))
    h.host.command('a', 'nslookup missing.local')
    expect(h.tables['dhcp:a']).toHaveLength(1)
  })
  it.each(['tcp', 'icmp'] as const)(
    'PAT translates %s and restores the inside identity',
    (kind) => {
      const r = pc('r', '10.0.0.1')
      r.interfaces.push({ ...r.interfaces[0], id: 'wan', ip: '203.0.113.1' })
      r.nat = { enabled: true, inside: ['r-if'], outside: 'wan' }
      const h = harness([r])
      const payload: TransportPayload =
        kind === 'icmp'
          ? { kind: 'icmp', type: 'echo-request', identifier: 'ping-a', sequence: 1, data: 'x' }
          : {
              kind: 'tcp',
              sourcePort: 1234,
              destinationPort: 80,
              sequence: 100,
              acknowledgment: 0,
              flags: ['SYN'],
              data: '',
            }
      const packet: IPv4Packet = {
        id: 'p',
        flowId: 'f',
        source: '10.0.0.2',
        destination: '198.51.100.1',
        ttl: 64,
        payload,
      }
      const translated = h.ext.outbound!(h.host, 'r', packet, 'wan')
      const reply: IPv4Packet = {
        ...translated,
        source: packet.destination,
        destination: translated.source,
        payload:
          translated.payload.kind === 'icmp'
            ? { ...translated.payload, type: 'echo-reply' }
            : ({
                ...translated.payload,
                sourcePort: 80,
                destinationPort: (translated.payload as { sourcePort: number }).sourcePort,
              } as TransportPayload),
      }
      const restored = h.ext.inbound!(h.host, 'r', reply, 'wan')
      expect(restored.destination).toBe('10.0.0.2')
      if (restored.payload.kind === 'icmp') expect(restored.payload.identifier).toBe('ping-a')
      else expect(restored.payload.destinationPort).toBe(1234)
      expect(packet.source).toBe('10.0.0.2')
    },
  )
})

describe('DHCP transaction loss and TCP handshake loss recovery', () => {
  it.each(['discover', 'offer', 'request', 'ack'])('retries DORA after losing first %s', (type) => {
    const a = pc('a', '0.0.0.0'),
      s = pc('s', '10.0.0.1')
    a.interfaces[0].mode = 'dhcp'
    s.dhcp = {
      enabled: true,
      start: '10.0.0.10',
      end: '10.0.0.20',
      prefix: 24,
      gateway: '10.0.0.1',
      dns: '10.0.0.1',
      leaseSeconds: 20,
    }
    const h = harness([a, s])
    let lost = false
    h.setDrop((p) => {
      if (!lost && p.payload.kind === 'udp' && JSON.parse(p.payload.data).type === type) {
        lost = true
        return true
      }
      return false
    })
    h.host.command('a', 'dhcp')
    h.advance(2_000_000)
    expect(lost).toBe(true)
    expect(a.interfaces[0].ip).toBe('10.0.0.10')
    expect(h.tables['dhcp:s']).toHaveLength(1)
    expect(h.tables['dhcp:s'][0].state).toBe('BOUND')
  })
  it.each(['SYN', 'SYN,ACK'])('recovers from first lost %s', (flags) => {
    const b = pc('b', '10.0.0.2')
    b.services = { tcpEcho: 7 }
    const h = harness([pc('a', '10.0.0.1'), b])
    let lost = false
    h.setDrop((p) => {
      if (!lost && p.payload.kind === 'tcp' && p.payload.flags.join() === flags) {
        lost = true
        return true
      }
      return false
    })
    h.host.command('a', 'tcp-connect 10.0.0.2 7')
    h.advance(2_000_000)
    expect(lost).toBe(true)
    expect(h.tables['tcp:a'][0].state).toBe('ESTABLISHED')
    expect(h.tables['tcp:b'][0].state).toBe('ESTABLISHED')
  })
})

describe('opposite-direction backpressure and UDP port demultiplexing', () => {
  it('retains a second request while the first echo response awaits retransmission', () => {
    const b = pc('b', '10.0.0.2')
    b.services = { tcpEcho: 7 }
    const h = harness([pc('a', '10.0.0.1'), b])
    h.host.command('a', 'tcp-connect 10.0.0.2 7')
    h.advance(1000)
    const id = String(h.tables['tcp:a'][0].id)
    let dropped = false
    h.setDrop((p) => {
      if (
        !dropped &&
        p.source === '10.0.0.2' &&
        p.payload.kind === 'tcp' &&
        p.payload.data === 'first'
      ) {
        dropped = true
        return true
      }
      return false
    })
    h.host.command('a', `tcp-send ${id} first`)
    h.advance(2000)
    h.host.command('a', `tcp-send ${id} second`)
    h.advance(3_000_000)
    for (const text of ['first', 'second'])
      for (const peer of ['a', 'b'])
        expect(
          h.lines.filter((s) => s.startsWith(`${peer}:`) && s.endsWith(`received: ${text}`)),
        ).toHaveLength(1)
  })
  it.each(['dns', 'dhcp'])(
    'echoes arbitrary %s-shaped JSON on the configured echo port',
    (service) => {
      const b = pc('b', '10.0.0.2')
      b.services = { udpEcho: 7 }
      const h = harness([pc('a', '10.0.0.1'), b])
      const data = JSON.stringify({ service, type: 'query', tx: 'x' })
      h.host.command('a', `udp-send 10.0.0.2 7 ${data}`)
      h.advance(1000)
      expect(h.lines).toContain(`a: UDP reply: ${data}`)
    },
  )
})
