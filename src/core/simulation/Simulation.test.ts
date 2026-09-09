import { describe, expect, it } from 'vitest'
import type {
  DeviceConfig,
  InterfaceConfig,
  NetworkDocument,
  ProtocolExtension,
} from '../contracts'
import { Simulation } from './Simulation'
import { EventQueue } from './EventQueue'
import { selectRoute } from '../routing/routes'
import { diagnose } from '../diagnostics/network'
import { inSubnet, ipv4 } from '../domain/ipv4'
const iface = (id: string, ip?: string, gateway?: string): InterfaceConfig => ({
  id,
  name: id,
  ip,
  gateway,
  prefix: 24,
  mac: `02:00:00:00:00:${id.charCodeAt(0).toString(16)}`,
  mode: 'static',
  up: true,
})
const device = (
  id: string,
  interfaces: InterfaceConfig[],
  kind: DeviceConfig['kind'] = 'pc',
): DeviceConfig => ({
  id,
  name: id,
  interfaces,
  kind,
  powered: true,
  position: { x: 0, y: 0 },
  routes: [],
})
function fixture(routed = false): NetworkDocument {
  const a = device('a', [iface('a', '10.0.1.2', routed ? '10.0.1.1' : undefined)])
  const b = device('b', [
    iface('b', routed ? '10.0.3.2' : '10.0.1.3', routed ? '10.0.3.1' : undefined),
  ])
  const r = device('r', [iface('c', '10.0.1.1'), iface('d', '10.0.2.1')], 'router')
  const s = device('s', [iface('e', '10.0.2.2'), iface('f', '10.0.3.1')], 'router')
  r.routes.push({
    network: '10.0.3.0',
    prefix: 24,
    gateway: '10.0.2.2',
    interfaceId: 'd',
    metric: 1,
  })
  s.routes.push({
    network: '10.0.1.0',
    prefix: 24,
    gateway: '10.0.2.1',
    interfaceId: 'e',
    metric: 1,
  })
  const pairs = routed
    ? [
        ['a', 'a', 'r', 'c'],
        ['r', 'd', 's', 'e'],
        ['s', 'f', 'b', 'b'],
      ]
    : [['a', 'a', 'b', 'b']]
  return {
    schemaVersion: 1,
    name: 'test',
    seed: 42,
    devices: routed ? [a, b, r, s] : [a, b],
    links: pairs.map(([a, ai, b, bi], n) => ({
      id: `l${n}`,
      a: { deviceId: a, interfaceId: ai },
      b: { deviceId: b, interfaceId: bi },
      latencyMs: 1,
      bandwidthMbps: 100,
      lossPercent: 0,
      queueCapacity: 8,
      up: true,
    })),
  }
}
const ping = (s: Simulation, destination = '10.0.1.3') => {
  s.command('a', `ping ${destination}`)
  s.runUntilIdle()
}
const replies = (s: Simulation) =>
  s.snapshot().terminal.filter((t) => t.text.startsWith('Reply from'))
describe('deterministic scheduler and addressing', () => {
  it('orders same-time events stably and cancels without perturbation', () => {
    const q = new EventQueue(),
      order: number[] = []
    q.push(2, () => order.push(2))
    q.push(1, () => order.push(1))
    q.push(1, () => order.push(99))()
    q.push(1, () => order.push(3))
    while (q.peek()) q.take()!.action()
    expect(order).toEqual([1, 3, 2])
    expect(q.size).toBe(0)
  })
  it('uses longest prefix then metric and filters disabled ports', () => {
    const d = fixture(true).devices[2]
    d.routes.push({ network: '10.0.3.2', prefix: 32, interfaceId: 'c', metric: 9 })
    expect(selectRoute(d, '10.0.3.2')?.interfaceId).toBe('c')
    d.interfaces[0].up = false
    expect(selectRoute(d, '10.0.3.2')?.interfaceId).toBe('d')
    expect(inSubnet('255.255.255.255', '0.0.0.0', 0)).toBe(true)
    expect(inSubnet('10.0.1.2', '10.0.2.0', 24)).toBe(false)
    expect(ipv4('300.0.0.1')).toBeUndefined()
  })
  it('bounds recurring callbacks and respects Step/advance equivalence', () => {
    const s = new Simulation(fixture())
    let count = 0
    const recurring = () => {
      count++
      s.schedule(100, recurring)
    }
    s.schedule(100, recurring)
    expect(s.runUntilIdle(1000, 450)).toBe(4)
    expect(count).toBe(4)
    const a = new Simulation(fixture()),
      b = new Simulation(fixture())
    a.command('a', 'ping 10.0.1.3')
    b.command('a', 'ping 10.0.1.3')
    while (a.step()) {
      /* run each individual event */
    }
    b.runUntilIdle()
    expect(a.snapshot()).toEqual(b.snapshot())
  })
})
describe('Ethernet, ARP and IPv4', () => {
  it('delivers one ping and reuses ARP cache', () => {
    const s = new Simulation(fixture())
    ping(s)
    expect(replies(s)).toHaveLength(1)
    expect(s.snapshot().arp.a[0].ip).toBe('10.0.1.3')
    const requests = s
      .snapshot()
      .trace.filter((t) => t.protocol === 'ARP' && t.type === 'request').length
    ping(s)
    expect(replies(s)).toHaveLength(2)
    expect(
      s.snapshot().trace.filter((t) => t.protocol === 'ARP' && t.type === 'request'),
    ).toHaveLength(requests)
    s.advanceTo(62000000)
    ping(s)
    expect(
      s.snapshot().trace.filter((t) => t.protocol === 'ARP' && t.type === 'request').length,
    ).toBeGreaterThan(requests)
  })
  it('forwards across two routers with TTL 62 and fresh Ethernet headers', () => {
    const s = new Simulation(fixture(true))
    ping(s, '10.0.3.2')
    expect(replies(s)[0].text).toContain('TTL=62')
    const request = s
      .snapshot()
      .trace.find(
        (t) =>
          t.deviceId === 'b' &&
          t.type === 'receive' &&
          t.after?.payload.kind === 'icmp' &&
          t.after.payload.type === 'echo-request',
      )
    expect(request?.after?.ttl).toBe(62)
    const packets = s.snapshot().transmissions.filter((t) => t.frame.etherType === 'IPv4')
    expect(packets[0].frame.source).toBe(fixture(true).devices[0].interfaces[0].mac)
    expect(packets.find((t) => t.fromDeviceId === 's')?.frame.source).toBe(
      fixture(true).devices[3].interfaces[1].mac,
    )
  })
  it('requires an independently valid reverse route', () => {
    const doc = fixture(true)
    doc.devices[1].interfaces[0].gateway = undefined
    const s = new Simulation(doc)
    ping(s, '10.0.3.2')
    expect(replies(s)).toHaveLength(0)
    expect(s.snapshot().trace.some((t) => t.deviceId === 'b' && t.reason === 'no-route')).toBe(true)
  })
  it('traces sequential TTL expiry and terminates at destination', () => {
    const s = new Simulation(fixture(true))
    s.command('a', 'traceroute 10.0.3.2')
    s.runUntilIdle()
    const lines = s.snapshot().terminal.map((t) => t.text)
    expect(lines.some((t) => t.startsWith('1  10.0.1.1') && t.includes('time-exceeded'))).toBe(true)
    expect(lines.some((t) => t.startsWith('2  ') && t.includes('time-exceeded'))).toBe(true)
    expect(lines.some((t) => t.startsWith('3  10.0.3.2') && t.includes('echo-reply'))).toBe(true)
  })
  it('reports unreachable if a transit router lacks forward route', () => {
    const doc = fixture(true)
    doc.devices[2].routes = []
    const s = new Simulation(doc)
    ping(s, '10.0.3.2')
    expect(
      s.snapshot().terminal.some((t) => t.deviceId === 'a' && t.text.includes('unreachable from')),
    ).toBe(true)
  })
  it('switch floods unknown addresses and learns subsequent unicast', () => {
    const doc = fixture(),
      sw = device('sw', [iface('x'), iface('y'), iface('z')], 'switch')
    doc.devices.push(sw, device('c', [iface('g', '10.0.1.4')]))
    const template = doc.links[0]
    doc.links = ['a', 'b', 'c'].map((d, n) => ({
      ...template,
      id: `l${n}`,
      a: { deviceId: d, interfaceId: d === 'c' ? 'g' : d },
      b: { deviceId: 'sw', interfaceId: ['x', 'y', 'z'][n] },
    }))
    const s = new Simulation(doc)
    ping(s)
    expect(replies(s)).toHaveLength(1)
    expect(s.snapshot().trace.some((t) => t.type === 'switch-flood')).toBe(true)
    expect(s.snapshot().trace.some((t) => t.type === 'switch-forward')).toBe(true)
    expect(
      s
        .snapshot()
        .transmissions.filter((t) => t.toDeviceId === 'c')
        .every((t) => t.frame.etherType === 'ARP'),
    ).toBe(true)
    s.advanceTo(310000000)
    expect(s.snapshot().mac.sw).toHaveLength(0)
  })
  it('rejects Ethernet cycles and segment duplicate addresses safely', () => {
    const doc = fixture()
    doc.devices[1].interfaces[0].ip = '10.0.1.2'
    expect(diagnose(doc).map((d) => d.code)).toContain('DUPLICATE_IP')
    const s = new Simulation(doc)
    ping(s)
    expect(replies(s)).toHaveLength(0)
    const loop = fixture()
    loop.links.push({ ...loop.links[0], id: 'parallel' })
    expect(diagnose(loop).map((d) => d.code)).toContain('L2_LOOP')
  })
})
describe('link conditions and extension boundaries', () => {
  it('retries ARP exactly three times on 100 percent loss then times out', () => {
    const doc = fixture()
    doc.links[0].lossPercent = 100
    const s = new Simulation(doc)
    ping(s)
    expect(replies(s)).toHaveLength(0)
    expect(s.snapshot().transmissions).toHaveLength(3)
    expect(s.snapshot().trace.some((t) => t.reason?.startsWith('arp-timeout'))).toBe(true)
    expect(s.snapshot().terminal.some((t) => t.text.includes('timed out'))).toBe(true)
  })
  it('serializes each direction independently with propagation and tail drop', () => {
    const doc = fixture()
    doc.links[0].bandwidthMbps = 1
    doc.links[0].queueCapacity = 0
    const s = new Simulation(doc),
      udp = { kind: 'udp' as const, sourcePort: 68, destinationPort: 67, data: 'x'.repeat(100) }
    s.sendIp('a', '255.255.255.255', udp, { interfaceId: 'a' })
    s.sendIp('a', '255.255.255.255', udp, { interfaceId: 'a' })
    s.sendIp('b', '255.255.255.255', udp, { interfaceId: 'b' })
    const tx = s.snapshot().transmissions
    expect(tx).toHaveLength(2)
    expect(tx[0].startUs).toBe(0)
    expect(tx[1].startUs).toBe(0)
    expect(tx[0].arrivalUs).toBe(2232)
    expect(s.snapshot().trace.some((t) => t.reason === 'tail-drop')).toBe(true)
  })
  it('receives DHCP limited broadcast from an unconfigured interface', () => {
    const doc = fixture()
    doc.devices[0].interfaces[0].ip = undefined
    let source: string | undefined
    const extension: ProtocolExtension = {
      receive: (_h, d, p) => {
        if (d === 'b') source = p.source
        return true
      },
    }
    const s = new Simulation(doc, [extension])
    s.sendIp(
      'a',
      '255.255.255.255',
      { kind: 'udp', sourcePort: 68, destinationPort: 67, data: 'discover' },
      { interfaceId: 'a', sourceIp: '0.0.0.0' },
    )
    s.runUntilIdle()
    expect(source).toBe('0.0.0.0')
  })
  it('runs inbound translation before local delivery and outbound after selecting port', () => {
    const seen: string[] = [],
      extension: ProtocolExtension = {
        outbound: (_h, d, p, port) => {
          seen.push(`out:${d}:${port}`)
          return p
        },
        inbound: (_h, d, p) => {
          seen.push(`in:${d}`)
          return d === 'b' ? { ...p, destination: '10.0.1.3' } : p
        },
        receive: (_h, d) => {
          seen.push(`received:${d}`)
          return true
        },
        command: (_h, _d, command) => command === 'ping name.example',
      }
    const s = new Simulation(fixture(), [extension])
    s.sendIp('a', '10.0.1.3', { kind: 'udp', sourcePort: 1, destinationPort: 2, data: 'hello' })
    s.runUntilIdle()
    expect(seen).toEqual(['out:a:a', 'in:b', 'received:b'])
    s.command('a', 'ping name.example')
    expect(s.snapshot().terminal).toHaveLength(0)
  })
  it('reset invalidates scheduled events and runtime state and reruns seed identically', () => {
    const s = new Simulation(fixture())
    let old = false
    s.schedule(1, () => {
      old = true
    })
    s.reset()
    expect(s.step()).toBe(false)
    expect(old).toBe(false)
    ping(s)
    const first = s.snapshot()
    s.reset()
    ping(s)
    const second = s.snapshot()
    expect(second.transmissions).toEqual(first.transmissions)
    expect(second.arp).toEqual(first.arp)
    s.setPower('b', false)
    ping(s)
    expect(replies(s)).toHaveLength(1)
    s.reset()
    expect(s.snapshot().devices[1].powered).toBe(true)
    s.setInterfaceState('b', 'b', false)
    ping(s)
    expect(replies(s)).toHaveLength(0)
    s.reset()
    s.setLinkState('l0', false)
    ping(s)
    expect(replies(s)).toHaveLength(0)
  })
})

describe('failure generation and workload bounds', () => {
  it.each(['link', 'power', 'interface'])(
    'invalidates pre-failure in-flight frames after %s down/up',
    (kind) => {
      const s = new Simulation(fixture())
      let received = 0
      const extension: ProtocolExtension = {
        receive: () => {
          received++
          return true
        },
      }
      const sim = new Simulation(s.document, [extension])
      sim.sendIp(
        'a',
        '255.255.255.255',
        { kind: 'udp', sourcePort: 1, destinationPort: 2, data: 'old' },
        { interfaceId: 'a' },
      )
      if (kind === 'link') {
        sim.setLinkState('l0', false)
        sim.setLinkState('l0', true)
      }
      if (kind === 'power') {
        sim.setPower('b', false)
        sim.setPower('b', true)
      }
      if (kind === 'interface') {
        sim.setInterfaceState('b', 'b', false)
        sim.setInterfaceState('b', 'b', true)
      }
      sim.runUntilIdle()
      expect(received).toBe(0)
      sim.sendIp(
        'a',
        '255.255.255.255',
        { kind: 'udp', sourcePort: 1, destinationPort: 2, data: 'new' },
        { interfaceId: 'a' },
      )
      sim.runUntilIdle()
      expect(received).toBe(1)
    },
  )
  it('handles 100000 scheduled events without scanning the queue per insertion', () => {
    const s = new Simulation(fixture())
    let count = 0
    for (let i = 0; i < 100000; i++)
      s.schedule(i % 100, () => {
        count++
      })
    expect(s.runUntilIdle()).toBe(100000)
    expect(count).toBe(100000)
  })
})

describe('trace integrity and queued serialization', () => {
  it('serializes waiting frames and preserves deterministic seeded loss', () => {
    const doc = fixture()
    doc.links[0].bandwidthMbps = 1
    doc.links[0].lossPercent = 40
    const run = () => {
      const s = new Simulation(doc)
      for (let i = 0; i < 5; i++)
        s.sendIp(
          'a',
          '255.255.255.255',
          { kind: 'udp', sourcePort: 1, destinationPort: 2, data: 'x'.repeat(100) },
          { interfaceId: 'a' },
        )
      s.runUntilIdle()
      return s.snapshot()
    }
    const a = run()
    expect(a).toEqual(run())
    expect(a.transmissions.map((t) => t.startUs)).toEqual([0, 1232, 2464, 3696, 4928])
    expect(a.trace.some((t) => t.reason === 'link-loss')).toBe(true)
  })
  it('exposes correlated copied route and packet traces', () => {
    const s = new Simulation(fixture(true))
    ping(s, '10.0.3.2')
    const snapshot = s.snapshot(),
      route = snapshot.trace.find((t) => t.type === 'route-selected')!
    expect(route.message).toContain('LPM')
    expect(route.packetId).toBeDefined()
    expect(
      snapshot.trace.find((t) => t.type === 'send' && t.protocol === 'ICMP')?.packetId,
    ).toBeDefined()
    const before = snapshot.trace.find((t) => t.type === 'forward')!.before!
    expect(before.ttl).toBe(64)
    before.ttl = 1
    expect(s.snapshot().trace.find((t) => t.type === 'forward')!.before!.ttl).toBe(64)
  })
})

describe('immediate receiver recovery', () => {
  it.each(['interface', 'power'])(
    'releases both link direction reservations after receiver %s failure',
    (kind) => {
      const doc = fixture()
      doc.links[0].bandwidthMbps = 0.001
      doc.links[0].queueCapacity = 1
      const received: string[] = []
      const sim = new Simulation(doc, [
        {
          receive: (_host, _device, packet) => {
            received.push(packet.payload.data)
            return true
          },
        },
      ])
      const send = (data: string) =>
        sim.sendIp(
          'a',
          '255.255.255.255',
          { kind: 'udp', sourcePort: 1, destinationPort: 2, data },
          { interfaceId: 'a' },
        )
      send('x'.repeat(1000))
      send('y'.repeat(1000))
      if (kind === 'interface') {
        sim.setInterfaceState('b', 'b', false)
        sim.setInterfaceState('b', 'b', true)
      } else {
        sim.setPower('b', false)
        sim.setPower('b', true)
      }
      send('fresh')
      expect(sim.snapshot().trace.some((t) => t.reason === 'tail-drop')).toBe(false)
      expect(sim.snapshot().transmissions.at(-1)?.startUs).toBe(0)
      sim.runUntilIdle()
      expect(received).toEqual(['fresh'])
    },
  )
})

it('normalizes fractional animation targets to integer virtual microseconds', () => {
  const s = new Simulation(fixture())
  expect(s.advanceTo(10.9)).toBe(0)
  expect(s.nowUs).toBe(10)
  s.schedule(0.4, () => {})
  expect(s.advanceTo(10.99)).toBe(0)
  expect(s.step()).toBe(true)
  expect(s.nowUs).toBe(11)
  expect(s.advanceTo(Number.NaN)).toBe(0)
  expect(s.nowUs).toBe(11)
})
