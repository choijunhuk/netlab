import type { DeviceConfig, DeviceKind, NetworkDocument } from '../core/contracts'
import { validateDocument } from '../storage'

export function createDevice(
  kind: DeviceKind,
  existing: DeviceConfig[],
  position = { x: 100, y: 100 },
  occupiedIds: string[] = [],
): DeviceConfig {
  const usedIds = new Set([
    ...occupiedIds,
    ...existing.flatMap((device) => [device.id, ...device.interfaces.map((intf) => intf.id)]),
  ])
  const usedMacs = new Set(
    existing.flatMap((device) => device.interfaces.map((intf) => intf.mac.toLowerCase())),
  )
  let sequence = 1
  while (
    usedIds.has(`${kind}${sequence}`) ||
    Array.from({ length: 8 }, (_, i) => `${kind}${sequence}-eth${i}`).some((id) => usedIds.has(id))
  )
    sequence++
  const id = `${kind}${sequence}`
  let macSequence = 1
  const interfaces = Array.from(
    { length: kind === 'switch' ? 8 : kind === 'router' ? 4 : 1 },
    (_, index) => {
      let mac: string
      do {
        mac = `02:${macSequence.toString(16).padStart(10, '0').match(/../g)!.join(':')}`
        macSequence++
      } while (usedMacs.has(mac))
      usedMacs.add(mac)
      return {
        id: `${id}-eth${index}`,
        name: `eth${index}`,
        mac,
        mode: 'static' as const,
        up: true,
      }
    },
  )
  return {
    id,
    name: id.toUpperCase(),
    kind,
    position: { ...position },
    powered: true,
    interfaces,
    routes: [],
    ...(kind === 'server' ? { services: { udpEcho: 7, tcpEcho: 7, http: true } } : {}),
  }
}
export function duplicateDevice(
  device: DeviceConfig,
  existing: DeviceConfig[],
  occupiedIds: string[] = [],
): DeviceConfig {
  const fresh = createDevice(
    device.kind,
    [...existing, device],
    {
      x: device.position.x + 40,
      y: device.position.y + 40,
    },
    occupiedIds,
  )
  fresh.name = `${device.name.slice(0, 95)} copy`
  // Only copy non-address service settings. Routes, NAT and DHCP depend on old ports/IPs.
  if (device.services) fresh.services = { ...device.services }
  return fresh
}
type Example = {
  id: string
  name: string
  description: string
  document: NetworkDocument
  command: string
  sourceDeviceId: string
}
function build(
  id: string,
  name: string,
  description: string,
  configure: (doc: NetworkDocument) => { source: DeviceConfig; command: string },
): Example {
  const document: NetworkDocument = { schemaVersion: 1, name, seed: 42, devices: [], links: [] }
  const { source, command } = configure(document)
  // Keep example devices apart at the rendered 210px node width.
  ;[...document.devices]
    .sort((a, b) => a.position.x - b.position.x)
    .forEach((device, index) => {
      const row = Math.floor(index / 3)
      device.position.x = (row % 2 === 0 ? index % 3 : 2 - (index % 3)) * 330
      device.position.y = 100 + row * 280
    })
  return {
    id,
    name,
    description,
    document: validateDocument(document),
    command,
    sourceDeviceId: source.id,
  }
}
function add(
  doc: NetworkDocument,
  kind: DeviceKind,
  x: number,
  y: number,
  customId?: string,
): DeviceConfig {
  const device = createDevice(
    kind,
    doc.devices,
    { x, y },
    doc.links.map((link) => link.id),
  )
  if (customId) {
    device.id = customId
    device.name = customId.toUpperCase()
    device.interfaces.forEach((intf, i) => {
      intf.id = `${customId}-eth${i}`
    })
  }
  doc.devices.push(device)
  return device
}
function address(device: DeviceConfig, index: number, ip: string, prefix = 24, gateway?: string) {
  Object.assign(device.interfaces[index], { ip, prefix, ...(gateway ? { gateway } : {}) })
}
function connect(doc: NetworkDocument, a: DeviceConfig, ai: number, b: DeviceConfig, bi: number) {
  doc.links.push({
    id: `link${doc.links.length + 1}`,
    a: { deviceId: a.id, interfaceId: a.interfaces[ai].id },
    b: { deviceId: b.id, interfaceId: b.interfaces[bi].id },
    latencyMs: 2,
    bandwidthMbps: 100,
    lossPercent: 0,
    queueCapacity: 64,
    up: true,
  })
}
function lan(
  doc: NetworkDocument,
  left: DeviceConfig,
  li: number,
  right: DeviceConfig,
  ri: number,
  x: number,
) {
  const sw = add(doc, 'switch', x, 180)
  connect(doc, left, li, sw, 0)
  connect(doc, sw, 1, right, ri)
}
export const examples: Example[] = [
  build('same-lan', 'Same LAN', 'ARP discovery and switching between two hosts.', (doc) => {
    const pc = add(doc, 'pc', 80, 180),
      server = add(doc, 'server', 600, 180)
    address(pc, 0, '192.168.1.10')
    address(server, 0, '192.168.1.20')
    lan(doc, pc, 0, server, 0, 340)
    return { source: pc, command: 'ping 192.168.1.20' }
  }),
  build(
    'router',
    'One router',
    'Independent forward and reverse routes across two LANs.',
    (doc) => {
      const pc = add(doc, 'pc', 50, 180),
        router = add(doc, 'router', 420, 180, 'r1'),
        server = add(doc, 'server', 800, 180)
      address(pc, 0, '192.168.1.10', 24, '192.168.1.1')
      address(router, 0, '192.168.1.1')
      address(router, 1, '192.168.2.1')
      address(server, 0, '192.168.2.10', 24, '192.168.2.1')
      lan(doc, pc, 0, router, 0, 220)
      lan(doc, router, 1, server, 0, 620)
      return { source: pc, command: 'ping 192.168.2.10' }
    },
  ),
  build(
    'two-routers',
    'Two routers',
    'Static routes in both directions; observe TTL at each router.',
    (doc) => {
      const pc = add(doc, 'pc', 20, 180),
        r1 = add(doc, 'router', 350, 180, 'r1'),
        r2 = add(doc, 'router', 580, 180, 'r2'),
        server = add(doc, 'server', 920, 180)
      address(pc, 0, '192.168.1.10', 24, '192.168.1.1')
      address(r1, 0, '192.168.1.1')
      address(r1, 1, '10.0.0.1', 30)
      address(r2, 0, '10.0.0.2', 30)
      address(r2, 1, '192.168.2.1')
      address(server, 0, '192.168.2.10', 24, '192.168.2.1')
      r1.routes.push({
        network: '192.168.2.0',
        prefix: 24,
        gateway: '10.0.0.2',
        interfaceId: r1.interfaces[1].id,
        metric: 1,
      })
      r2.routes.push({
        network: '192.168.1.0',
        prefix: 24,
        gateway: '10.0.0.1',
        interfaceId: r2.interfaces[0].id,
        metric: 1,
      })
      lan(doc, pc, 0, r1, 0, 170)
      connect(doc, r1, 1, r2, 0)
      lan(doc, r2, 1, server, 0, 750)
      return { source: pc, command: 'ping 192.168.2.10' }
    },
  ),
  build(
    'dhcp',
    'DHCP address lease',
    'Run DHCP to watch Discover, Offer, Request and Acknowledge.',
    (doc) => {
      const pc = add(doc, 'pc', 80, 180),
        server = add(doc, 'server', 600, 180)
      pc.interfaces[0].mode = 'dhcp'
      address(server, 0, '192.168.1.1')
      server.dhcp = {
        enabled: true,
        start: '192.168.1.100',
        end: '192.168.1.110',
        prefix: 24,
        gateway: '192.168.1.1',
        dns: '192.168.1.1',
        leaseSeconds: 3600,
      }
      server.dnsRecords = { 'example.local': '192.168.1.1' }
      lan(doc, pc, 0, server, 0, 340)
      return { source: pc, command: 'dhcp' }
    },
  ),
  build('dns-web', 'DNS and web', 'Resolve example.local, then exchange HTTP over TCP.', (doc) => {
    const pc = add(doc, 'pc', 80, 180),
      server = add(doc, 'server', 600, 180)
    address(pc, 0, '192.168.1.10')
    pc.interfaces[0].dns = '192.168.1.20'
    address(server, 0, '192.168.1.20')
    server.dnsRecords = { 'example.local': '192.168.1.20' }
    lan(doc, pc, 0, server, 0, 340)
    return { source: pc, command: 'http-get example.local' }
  }),
  build(
    'nat',
    'NAT / PAT',
    'Private client reaches a public server through port translation.',
    (doc) => {
      const pc = add(doc, 'pc', 50, 180),
        router = add(doc, 'router', 420, 180, 'r1'),
        server = add(doc, 'server', 800, 180)
      address(pc, 0, '192.168.1.10', 24, '192.168.1.1')
      address(router, 0, '192.168.1.1')
      address(router, 1, '203.0.113.1')
      address(server, 0, '203.0.113.10', 24, '203.0.113.1')
      router.nat = {
        enabled: true,
        inside: [router.interfaces[0].id],
        outside: router.interfaces[1].id,
      }
      lan(doc, pc, 0, router, 0, 220)
      lan(doc, router, 1, server, 0, 620)
      return { source: pc, command: 'udp-send 203.0.113.10 7 hello' }
    },
  ),
]
