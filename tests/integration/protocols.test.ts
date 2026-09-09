import { describe, expect, it } from 'vitest'
import { createSimulation } from '../../src/application/createSimulation'
import { examples } from '../../src/examples'
import { exportDocument, importDocument } from '../../src/storage'
import type { IPv4Packet, NetworkDocument, TraceRecord } from '../../src/core/contracts'

function lab(id: string) {
  const example = examples.find((item) => item.id === id)
  if (!example) throw new Error(`Missing required lab ${id}`)
  return { ...example, document: structuredClone(example.document) }
}
function packets(trace: TraceRecord[]): IPv4Packet[] {
  return trace.flatMap((event) =>
    event.frame?.payload && 'ttl' in event.frame.payload ? [event.frame.payload] : [],
  )
}
function run(id: string) {
  const example = lab(id)
  const sim = createSimulation(example.document)
  sim.command(example.sourceDeviceId, example.command)
  sim.advanceTo(8_000_000)
  return sim
}

describe('complete protocol paths (real scheduler, Ethernet and IP)', () => {
  it('performs a cold LAN ping, then uses learned ARP on a warm ping', () => {
    const example = lab('same-lan')
    const sim = createSimulation(example.document)
    sim.command(example.sourceDeviceId, example.command)
    sim.advanceTo(4_000_000)
    const first = sim.snapshot()
    expect(first.terminal.some((line) => /Reply from/i.test(line.text))).toBe(true)
    expect(first.trace.some((event) => event.protocol === 'ARP')).toBe(true)
    expect(Object.values(first.mac).flat().length).toBeGreaterThanOrEqual(2)
    const arpCount = first.trace.filter((event) => event.protocol === 'ARP').length
    sim.command(example.sourceDeviceId, example.command)
    sim.advanceTo(8_000_000)
    expect(sim.snapshot().trace.filter((event) => event.protocol === 'ARP')).toHaveLength(arpCount)
  })

  it('routes request and reply independently across two routers with TTL62', () => {
    const sim = run('two-routers')
    const snapshot = sim.snapshot()
    expect(snapshot.terminal.some((line) => /Reply from 192\.168\.2\.10/i.test(line.text))).toBe(
      true,
    )
    const ip = packets(snapshot.trace)
    expect(
      ip.some(
        (p) =>
          p.payload.kind === 'icmp' &&
          p.payload.type === 'echo-request' &&
          p.destination === '192.168.2.10' &&
          p.ttl === 62,
      ),
    ).toBe(true)
    expect(
      ip.some(
        (p) =>
          p.payload.kind === 'icmp' &&
          p.payload.type === 'echo-reply' &&
          p.destination === '192.168.1.10' &&
          p.ttl === 62,
      ),
    ).toBe(true)
    const requestFrames = snapshot.trace.flatMap((event) => {
      const frame = event.frame
      if (
        !frame ||
        !('ttl' in frame.payload) ||
        frame.payload.payload.kind !== 'icmp' ||
        frame.payload.payload.type !== 'echo-request'
      )
        return []
      return [frame.source]
    })
    expect(new Set(requestFrames).size).toBeGreaterThanOrEqual(3)
  })

  it('does not invent a reverse route from a successful request', () => {
    const example = lab('two-routers')
    const lastRouter = example.document.devices.find(
      (d) => d.kind === 'router' && d.interfaces.some((i) => i.ip === '192.168.2.1'),
    )!
    lastRouter.routes = []
    const sim = createSimulation(example.document)
    sim.command(example.sourceDeviceId, example.command)
    sim.advanceTo(8_000_000)
    expect(
      sim.snapshot().terminal.some((line) => /Reply from 192\.168\.2\.10/i.test(line.text)),
    ).toBe(false)
    expect(
      sim
        .snapshot()
        .trace.some((event) =>
          /route|unreachable|timeout/i.test(`${event.reason} ${event.type} ${event.message}`),
        ),
    ).toBe(true)
  })

  it('100 percent frame loss never yields a ping reply', () => {
    const example = lab('same-lan')
    example.document.links.forEach((link) => {
      link.lossPercent = 100
    })
    const sim = createSimulation(example.document)
    sim.command(example.sourceDeviceId, example.command)
    sim.advanceTo(8_000_000)
    expect(sim.snapshot().terminal.some((line) => /Reply from/i.test(line.text))).toBe(false)
    expect(
      sim
        .snapshot()
        .trace.some((event) => /loss|drop/i.test(`${event.reason} ${event.type} ${event.message}`)),
    ).toBe(true)
  })

  it('reset cancels old ping and frame activity', () => {
    const example = lab('same-lan')
    const sim = createSimulation(example.document)
    sim.command(example.sourceDeviceId, example.command)
    sim.step()
    sim.reset()
    sim.advanceTo(8_000_000)
    expect(sim.snapshot().transmissions).toHaveLength(0)
    expect(sim.snapshot().terminal.some((line) => /Reply from/i.test(line.text))).toBe(false)
  })

  it('same seed and inputs produce the same semantic trace', () => {
    const example = lab('two-routers')
    example.document.links.forEach((link) => {
      link.lossPercent = 20
    })
    function replay(document: NetworkDocument) {
      const sim = createSimulation(document)
      sim.command(example.sourceDeviceId, example.command)
      sim.advanceTo(8_000_000)
      return sim.snapshot().trace.map(({ runId: _runId, ...event }) => event)
    }
    expect(replay(example.document)).toEqual(replay(example.document))
  })

  it('all six examples roundtrip without persisting runtime caches', () => {
    expect(examples).toHaveLength(6)
    for (const example of examples) {
      expect(importDocument(exportDocument(example.document))).toEqual(example.document)
      expect(JSON.parse(exportDocument(example.document))).not.toHaveProperty('arp')
    }
  })

  it('DHCP assigns an address only after actual DORA packets', () => {
    const example = lab('dhcp')
    const sim = createSimulation(example.document)
    sim.advanceTo(5_000_000)
    const client = sim.snapshot().devices.find((device) => device.id === example.sourceDeviceId)!
    expect(
      client.interfaces.some(
        (iface) => iface.mode === 'dhcp' && !!iface.ip && iface.ip !== '0.0.0.0',
      ),
    ).toBe(true)
    const log = sim
      .snapshot()
      .trace.filter((event) => event.protocol === 'DHCP')
      .map((event) => `${event.type} ${event.message}`)
      .join('\n')
    for (const type of ['discover', 'offer', 'request', 'ack'])
      expect(log.toLowerCase()).toContain(type)
    expect(
      packets(sim.snapshot().trace).some(
        (p) => p.payload.kind === 'udp' && p.payload.destinationPort === 67,
      ),
    ).toBe(true)
  })

  it('resolves DNS over UDP before sending hostname ping', () => {
    const example = lab('dns-web')
    const sim = createSimulation(example.document)
    sim.command(example.sourceDeviceId, 'ping example.local')
    sim.advanceTo(8_000_000)
    expect(sim.snapshot().trace.some((event) => event.protocol === 'DNS')).toBe(true)
    expect(sim.snapshot().terminal.some((line) => /Reply from/i.test(line.text))).toBe(true)
  })

  it('NAT example completes roundtrip and records header translation', () => {
    const sim = run('nat')
    const state = sim.snapshot()
    expect(
      state.trace.some(
        (event) =>
          event.before &&
          event.after &&
          (event.before.source !== event.after.source ||
            event.before.destination !== event.after.destination),
      ),
    ).toBe(true)
    expect(
      state.terminal.some((line) => /Reply from|received|echo|connected|HTTP/i.test(line.text)),
    ).toBe(true)
  })
})

describe('transport and services across physical links', () => {
  it('opens TCP, counts UTF8 bytes, echoes data and completes close', () => {
    const example = lab('two-routers')
    const sim = createSimulation(example.document)
    sim.command(example.sourceDeviceId, 'tcp-connect 192.168.2.10 7')
    sim.advanceTo(1_000_000)
    const row = sim
      .snapshot()
      .tables[`tcp:${example.sourceDeviceId}`]?.find((entry) => entry.state === 'ESTABLISHED')
    expect(row).toBeDefined()
    const connectionId = String(row!.id)
    sim.command(example.sourceDeviceId, `tcp-send ${connectionId} 안녕`)
    sim.advanceTo(2_000_000)
    expect(
      sim
        .snapshot()
        .terminal.some(
          (line) => line.deviceId === example.sourceDeviceId && /received: 안녕/.test(line.text),
        ),
    ).toBe(true)
    expect(sim.snapshot().tables[`tcp:${example.sourceDeviceId}`][0].sendNext).toBe(1007)
    sim.command(example.sourceDeviceId, `tcp-close ${connectionId}`)
    sim.advanceTo(6_000_000)
    expect(sim.snapshot().tables[`tcp:${example.sourceDeviceId}`][0].state).toBe('CLOSED')
  })

  it('fetches web response using DNS, TCP SYN/SYN-ACK/ACK and data packets', () => {
    const sim = run('dns-web')
    const snapshot = sim.snapshot()
    expect(snapshot.terminal.some((line) => /HTTP\/1\.0 200 OK/.test(line.text))).toBe(true)
    const tcp = packets(snapshot.trace).flatMap((packet) =>
      packet.payload.kind === 'tcp' ? [packet.payload] : [],
    )
    expect(tcp.some((p) => p.flags.includes('SYN') && !p.flags.includes('ACK'))).toBe(true)
    expect(tcp.some((p) => p.flags.includes('SYN') && p.flags.includes('ACK'))).toBe(true)
    expect(tcp.some((p) => p.data.startsWith('GET /'))).toBe(true)
  })

  it('reports unknown DNS records instead of sending an invented ping', () => {
    const example = lab('dns-web')
    const sim = createSimulation(example.document)
    sim.command(example.sourceDeviceId, 'ping missing.example.local')
    sim.advanceTo(5_000_000)
    expect(sim.snapshot().terminal.some((line) => /NXDOMAIN/.test(line.text))).toBe(true)
    expect(
      packets(sim.snapshot().trace).some(
        (p) => p.payload.kind === 'icmp' && p.payload.type === 'echo-request',
      ),
    ).toBe(false)
  })

  it('PAT echoes to the initiating private client and restores ICMP identifiers', () => {
    const example = lab('nat')
    const sim = createSimulation(example.document)
    sim.command(example.sourceDeviceId, example.command)
    sim.advanceTo(2_000_000)
    expect(
      sim
        .snapshot()
        .terminal.some(
          (line) => line.deviceId === example.sourceDeviceId && /UDP reply: hello/.test(line.text),
        ),
    ).toBe(true)
    sim.command(example.sourceDeviceId, 'ping 203.0.113.10')
    sim.advanceTo(4_000_000)
    expect(
      sim
        .snapshot()
        .terminal.some(
          (line) =>
            line.deviceId === example.sourceDeviceId &&
            /Reply from 203\.0\.113\.10/.test(line.text),
        ),
    ).toBe(true)
  })

  it('keeps expired DHCP leases from remaining configured after server failure', () => {
    const example = lab('dhcp')
    const server = example.document.devices.find((d) => d.dhcp?.enabled)!
    server.dhcp!.leaseSeconds = 10
    const sim = createSimulation(example.document)
    sim.advanceTo(1_000_000)
    expect(
      sim.snapshot().devices.find((d) => d.id === example.sourceDeviceId)!.interfaces[0].ip,
    ).toBeTruthy()
    sim.setPower(server.id, false)
    sim.advanceTo(15_000_000)
    expect(
      sim.snapshot().devices.find((d) => d.id === example.sourceDeviceId)!.interfaces[0].ip,
    ).toBeUndefined()
  })
})
