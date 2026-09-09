import type {
  ARPEntry,
  DeviceConfig,
  EthernetFrame,
  ICMPMessage,
  IPv4Packet,
  MACEntry,
  NetworkDocument,
  ProtocolExtension,
  SendOptions,
  SimulationHost,
  SimulationSnapshot,
  TerminalLine,
  TraceRecord,
  Transmission,
  TransportPayload,
} from '../contracts'
import { ipv4 } from '../domain/ipv4'
import { diagnose } from '../diagnostics/network'
import { routesFor, selectRoute } from '../routing/routes'
import { EventQueue } from './EventQueue'
const BROADCAST = 'ff:ff:ff:ff:ff:ff'
const LIMIT = 10000
interface Pending {
  packets: IPv4Packet[]
  attempt: number
}
interface Probe {
  deviceId: string
  destination: string
  start: number
  cancel: () => void
  hop?: number
}
export class Simulation implements SimulationHost {
  readonly document: NetworkDocument
  nowUs = 0
  private initial: NetworkDocument
  private extensions: ProtocolExtension[]
  private queue = new EventQueue()
  private serial = 0
  private generation = 0
  private random = 1
  private records: TraceRecord[] = []
  private lines: TerminalLine[] = []
  private flights: Transmission[] = []
  private arp = new Map<string, ARPEntry[]>()
  private mac = new Map<string, MACEntry[]>()
  private pending = new Map<string, Pending>()
  private directions = new Map<string, number[]>()
  private versions = new Map<string, number>()
  private probes = new Map<string, Probe>()
  private tables: SimulationSnapshot['tables'] = {}
  private invalid = false
  constructor(document: NetworkDocument, extensions: ProtocolExtension[] = []) {
    this.initial = structuredClone(document)
    this.document = structuredClone(document)
    this.extensions = extensions
    this.reset()
  }
  id(prefix: string): string {
    return `${prefix}-${this.serial++}`
  }
  schedule(delayUs: number, action: () => void): () => void {
    if (!Number.isFinite(delayUs) || delayUs < 0)
      throw new Error('Event delay must be finite and nonnegative')
    if (this.queue.size >= 100000) {
      this.trace({
        protocol: 'System',
        type: 'drop',
        message: 'Event queue capacity reached',
        reason: 'queue-limit',
      })
      return () => {}
    }
    return this.queue.push(this.nowUs + Math.ceil(delayUs), action)
  }
  step(): boolean {
    const e = this.queue.take()
    if (!e) return false
    this.nowUs = e.time
    e.action()
    return true
  }
  advanceTo(timeUs: number, budget = 10000): number {
    if (!Number.isFinite(timeUs) || timeUs < this.nowUs) return 0
    timeUs = Math.floor(timeUs)
    let n = 0
    while (n < budget && this.queue.peek() && this.queue.peek()!.time <= timeUs) {
      this.step()
      n++
    }
    if (!this.queue.peek() || this.queue.peek()!.time > timeUs) this.nowUs = timeUs
    return n
  }
  runUntilIdle(maxEvents = 100000, maxTimeUs = 60000000): number {
    const end = this.nowUs + maxTimeUs
    let n = 0
    while (n < maxEvents && this.queue.peek() && this.queue.peek()!.time <= end) {
      this.step()
      n++
    }
    return n
  }
  trace(record: Omit<TraceRecord, 'id' | 'runId' | 'timeUs'>): void {
    this.records.push(
      structuredClone({
        ...record,
        id: this.id('trace'),
        runId: `run-${this.generation}`,
        timeUs: this.nowUs,
      }),
    )
    if (this.records.length > LIMIT) this.records.shift()
  }
  print(deviceId: string, text: string): void {
    this.lines.push({ id: this.id('line'), deviceId, timeUs: this.nowUs, text })
    if (this.lines.length > LIMIT) this.lines.shift()
  }
  setTable(key: string, rows: SimulationSnapshot['tables'][string]): void {
    this.tables[key] = structuredClone(rows.slice(0, LIMIT))
  }
  snapshot(): SimulationSnapshot {
    this.expire()
    return structuredClone({
      nowUs: this.nowUs,
      pendingEvents: this.queue.size,
      trace: this.records,
      terminal: this.lines,
      transmissions: this.flights,
      arp: Object.fromEntries(this.arp),
      mac: Object.fromEntries(this.mac),
      tables: this.tables,
      devices: this.document.devices,
      links: this.document.links,
    })
  }
  reset(): void {
    this.generation++
    this.serial = 0
    this.nowUs = 0
    this.random = this.initial.seed >>> 0 || 1
    this.queue = new EventQueue()
    Object.assign(this.document, structuredClone(this.initial))
    this.records = []
    this.lines = []
    this.flights = []
    this.arp.clear()
    this.mac.clear()
    this.pending.clear()
    this.directions.clear()
    this.probes.clear()
    this.versions.clear()
    this.tables = {}
    const errors = diagnose(this.document)
    this.invalid = errors.length > 0
    for (const e of errors)
      this.trace({
        protocol: 'System',
        type: 'diagnostic',
        message: e.message,
        reason: e.code,
        deviceId: e.deviceId,
        interfaceId: e.interfaceId,
      })
    for (const extension of this.extensions) extension.reset?.(this)
  }
  private device(id: string): DeviceConfig | undefined {
    return this.document.devices.find((d) => d.id === id)
  }
  private expire(): void {
    for (const [d, rows] of this.arp)
      this.arp.set(
        d,
        rows.filter((r) => r.expiresAtUs > this.nowUs),
      )
    for (const [d, rows] of this.mac)
      this.mac.set(
        d,
        rows.filter((r) => r.expiresAtUs > this.nowUs),
      )
  }
  private invalidate(deviceId: string, interfaceId: string): void {
    const key = `${deviceId}/${interfaceId}`
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1)
    this.arp.set(
      deviceId,
      (this.arp.get(deviceId) ?? []).filter((a) => a.interfaceId !== interfaceId),
    )
    this.mac.set(
      deviceId,
      (this.mac.get(deviceId) ?? []).filter((a) => a.interfaceId !== interfaceId),
    )
    for (const pending of this.pending.keys())
      if (pending.startsWith(`${key}/`)) this.pending.delete(pending)
    // Every reservation on an attached link targets or originates at this endpoint.
    // Its failure invalidates both directions, including the peer's transmit queue.
    for (const link of this.document.links) {
      if (
        (link.a.deviceId === deviceId && link.a.interfaceId === interfaceId) ||
        (link.b.deviceId === deviceId && link.b.interfaceId === interfaceId)
      ) {
        this.directions.delete(`${link.id}/${link.a.deviceId}/${link.a.interfaceId}`)
        this.directions.delete(`${link.id}/${link.b.deviceId}/${link.b.interfaceId}`)
      }
    }
  }
  setLinkState(id: string, up: boolean): void {
    const link = this.document.links.find((l) => l.id === id)
    if (!link || link.up === up) return
    link.up = up
    this.invalidate(link.a.deviceId, link.a.interfaceId)
    this.invalidate(link.b.deviceId, link.b.interfaceId)
    this.trace({
      protocol: 'System',
      type: 'link-state',
      linkId: id,
      message: `Link ${up ? 'up' : 'down'}; previous in-flight frames invalidated`,
    })
  }
  setInterfaceState(deviceId: string, interfaceId: string, up: boolean): void {
    const i = this.device(deviceId)?.interfaces.find((i) => i.id === interfaceId)
    if (!i || i.up === up) return
    i.up = up
    this.invalidate(deviceId, interfaceId)
    this.trace({
      protocol: 'System',
      type: 'interface-state',
      deviceId,
      interfaceId,
      message: `Interface ${up ? 'up' : 'down'}; previous in-flight frames invalidated`,
    })
  }
  setPower(deviceId: string, powered: boolean): void {
    const d = this.device(deviceId)
    if (!d || d.powered === powered) return
    d.powered = powered
    for (const i of d.interfaces) this.invalidate(deviceId, i.id)
    this.trace({
      protocol: 'System',
      type: 'power-state',
      deviceId,
      message: `Device ${powered ? 'on' : 'off'}; previous in-flight frames invalidated`,
    })
  }
  private drop(deviceId: string, reason: string, packet?: IPv4Packet): void {
    this.trace({
      protocol: packet?.payload.kind === 'icmp' ? 'ICMP' : 'Routing',
      type: 'drop',
      deviceId,
      packetId: packet?.id,
      flowId: packet?.flowId,
      reason,
      message: reason,
      before: packet,
    })
  }
  sendIp(
    deviceId: string,
    destination: string,
    payload: TransportPayload,
    options: SendOptions = {},
  ): void {
    const d = this.device(deviceId)
    if (!d || !d.powered || this.invalid) {
      this.drop(deviceId, this.invalid ? 'invalid-topology' : 'device-off')
      return
    }
    if (ipv4(destination) === undefined) {
      this.print(
        deviceId,
        'Invalid IPv4 destination. Use a dotted IPv4 address or configured DNS name.',
      )
      return
    }
    const r = selectRoute(d, destination, options.interfaceId)
    const iface = d.interfaces.find((i) => i.id === (options.interfaceId ?? r?.interfaceId))
    const packet: IPv4Packet = {
      id: this.id('ip'),
      flowId: options.flowId ?? this.id('flow'),
      source: options.sourceIp ?? iface?.ip ?? '0.0.0.0',
      destination,
      ttl: options.ttl ?? 64,
      payload: structuredClone(payload),
    }
    if (destination === '255.255.255.255' && iface?.up) {
      this.output(d, iface.id, packet, BROADCAST)
      return
    }
    if (d.interfaces.some((i) => i.up && i.ip === destination)) {
      this.receiveIp(d, iface?.id ?? d.interfaces[0].id, packet)
      return
    }
    this.route(d, packet, options.interfaceId)
  }
  private route(d: DeviceConfig, packet: IPv4Packet, interfaceId?: string): void {
    const route = selectRoute(d, packet.destination, interfaceId)
    if (!route) {
      this.drop(d.id, 'no-route', packet)
      this.print(
        d.id,
        `No route to ${packet.destination}. Configure a connected address, static route or gateway.`,
      )
      this.icmpError(d, packet, 'unreachable')
      return
    }
    const iface = d.interfaces.find((i) => i.id === route.interfaceId)!
    if (!iface.ip) {
      this.drop(d.id, 'interface-has-no-ip', packet)
      return
    }
    let outgoing = structuredClone(packet)
    for (const extension of this.extensions)
      outgoing = extension.outbound?.(this, d.id, outgoing, iface.id) ?? outgoing
    const nextHop = route.gateway ?? outgoing.destination
    this.trace({
      protocol: 'Routing',
      type: 'route-selected',
      deviceId: d.id,
      interfaceId: iface.id,
      packetId: outgoing.id,
      flowId: outgoing.flowId,
      before: packet,
      after: outgoing,
      message: `LPM ${route.network}/${route.prefix} metric ${route.metric}: ${iface.name}, next hop ${nextHop}`,
    })
    this.expire()
    const cached = this.arp.get(d.id)?.find((a) => a.interfaceId === iface.id && a.ip === nextHop)
    if (cached) {
      this.output(d, iface.id, outgoing, cached.mac)
      return
    }
    const key = `${d.id}/${iface.id}/${nextHop}`,
      existing = this.pending.get(key)
    if (existing) {
      if (existing.packets.length < 256) existing.packets.push(outgoing)
      else this.drop(d.id, 'arp-pending-full', packet)
      return
    }
    const pending: Pending = { packets: [outgoing], attempt: 0 }
    this.pending.set(key, pending)
    const request = () => {
      if (this.pending.get(key) !== pending) return
      if (!d.powered || !iface.up || pending.attempt >= 3) {
        this.pending.delete(key)
        for (const p of pending.packets)
          this.drop(d.id, 'arp-timeout: check peer address and link', p)
        return
      }
      pending.attempt++
      this.emit(d.id, iface.id, {
        id: this.id('frame'),
        source: iface.mac,
        destination: BROADCAST,
        etherType: 'ARP',
        payload: {
          kind: 'arp',
          operation: 'request',
          senderIp: iface.ip!,
          senderMac: iface.mac,
          targetIp: nextHop,
        },
      })
      this.schedule(1000000, request)
    }
    request()
  }
  private output(
    d: DeviceConfig,
    interfaceId: string,
    packet: IPv4Packet,
    destination: string,
  ): void {
    const i = d.interfaces.find((i) => i.id === interfaceId)!
    this.emit(d.id, interfaceId, {
      id: this.id('frame'),
      source: i.mac,
      destination,
      etherType: 'IPv4',
      payload: packet,
    })
  }
  private emit(deviceId: string, interfaceId: string, frame: EthernetFrame): void {
    const d = this.device(deviceId),
      iface = d?.interfaces.find((i) => i.id === interfaceId)
    if (!d?.powered || !iface?.up) {
      this.drop(deviceId, 'interface-down')
      return
    }
    const link = this.document.links.find(
      (l) =>
        (l.a.deviceId === deviceId && l.a.interfaceId === interfaceId) ||
        (l.b.deviceId === deviceId && l.b.interfaceId === interfaceId),
    )
    if (!link?.up) {
      this.drop(deviceId, 'link-down-or-unconnected')
      return
    }
    const target =
      link.a.deviceId === deviceId && link.a.interfaceId === interfaceId ? link.b : link.a
    const sourceKey = `${deviceId}/${interfaceId}`,
      targetKey = `${target.deviceId}/${target.interfaceId}`
    const sourceVersion = this.versions.get(sourceKey) ?? 0,
      targetVersion = this.versions.get(targetKey) ?? 0
    const direction = `${link.id}/${deviceId}/${interfaceId}`
    const finishes = (this.directions.get(direction) ?? []).filter((t) => t > this.nowUs)
    if (finishes.length >= link.queueCapacity + 1) {
      this.drop(deviceId, 'tail-drop')
      return
    }
    const bytes =
      'kind' in frame.payload
        ? 64
        : 14 + 20 + 20 + new TextEncoder().encode(frame.payload.payload.data).length
    const duration = Math.max(1, Math.ceil((bytes * 8) / Math.max(0.001, link.bandwidthMbps)))
    const startUs = Math.max(this.nowUs, finishes.at(-1) ?? this.nowUs),
      finish = startUs + duration
    finishes.push(finish)
    this.directions.set(direction, finishes)
    const arrivalUs = finish + Math.ceil(link.latencyMs * 1000)
    const protocol =
      'kind' in frame.payload
        ? 'ARP'
        : (frame.payload.payload.kind.toUpperCase() as 'ICMP' | 'UDP' | 'TCP')
    this.flights.push({
      id: this.id('tx'),
      linkId: link.id,
      fromDeviceId: deviceId,
      toDeviceId: target.deviceId,
      startUs,
      arrivalUs,
      protocol,
      frame: structuredClone(frame),
    })
    if (this.flights.length > LIMIT) this.flights.shift()
    this.trace({
      protocol,
      type: 'send',
      deviceId,
      interfaceId,
      linkId: link.id,
      packetId: 'kind' in frame.payload ? undefined : frame.payload.id,
      flowId: 'kind' in frame.payload ? undefined : frame.payload.flowId,
      frame,
      message: `${protocol} frame sent`,
    })
    this.random ^= this.random << 13
    this.random ^= this.random >>> 17
    this.random ^= this.random << 5
    const lost = ((this.random >>> 0) / 4294967296) * 100 < link.lossPercent
    this.schedule(arrivalUs - this.nowUs, () => {
      if (
        lost ||
        !link.up ||
        !d.powered ||
        !iface.up ||
        sourceVersion !== (this.versions.get(sourceKey) ?? 0) ||
        targetVersion !== (this.versions.get(targetKey) ?? 0)
      ) {
        this.drop(deviceId, lost ? 'link-loss' : 'link-changed')
        return
      }
      this.receiveFrame(target.deviceId, target.interfaceId, structuredClone(frame))
    })
  }
  private receiveFrame(deviceId: string, interfaceId: string, frame: EthernetFrame): void {
    const d = this.device(deviceId),
      iface = d?.interfaces.find((i) => i.id === interfaceId)
    if (!d?.powered || !iface?.up) {
      this.drop(deviceId, 'receiver-down')
      return
    }
    if (d.kind === 'switch') {
      this.expire()
      const rows = (this.mac.get(d.id) ?? []).filter((m) => m.mac !== frame.source)
      rows.push({ mac: frame.source, interfaceId, expiresAtUs: this.nowUs + 300000000 })
      this.mac.set(d.id, rows)
      const learned = rows.find((m) => m.mac === frame.destination)
      this.trace({
        protocol: 'System',
        type: learned ? 'switch-forward' : 'switch-flood',
        deviceId,
        interfaceId,
        frame,
        message: learned
          ? `Known MAC on ${learned.interfaceId}`
          : 'Flood unknown or broadcast destination',
      })
      for (const port of d.interfaces)
        if (port.id !== interfaceId && port.up && (!learned || port.id === learned.interfaceId))
          this.emit(d.id, port.id, frame)
      return
    }
    if (
      frame.destination.toLowerCase() !== iface.mac.toLowerCase() &&
      frame.destination !== BROADCAST
    )
      return
    if ('kind' in frame.payload) {
      const a = frame.payload
      if (a.senderIp !== '0.0.0.0') {
        const rows = (this.arp.get(d.id) ?? []).filter(
          (r) => !(r.interfaceId === interfaceId && r.ip === a.senderIp),
        )
        rows.push({
          interfaceId,
          ip: a.senderIp,
          mac: a.senderMac,
          expiresAtUs: this.nowUs + 60000000,
        })
        this.arp.set(d.id, rows)
        const key = `${d.id}/${interfaceId}/${a.senderIp}`,
          pending = this.pending.get(key)
        if (pending) {
          this.pending.delete(key)
          for (const packet of pending.packets) this.output(d, interfaceId, packet, a.senderMac)
        }
      }
      this.trace({
        protocol: 'ARP',
        type: a.operation,
        deviceId,
        interfaceId,
        frame,
        message: `ARP ${a.operation} ${a.senderIp} → ${a.targetIp}`,
      })
      if (a.operation === 'request' && iface.ip === a.targetIp)
        this.emit(d.id, interfaceId, {
          id: this.id('frame'),
          source: iface.mac,
          destination: a.senderMac,
          etherType: 'ARP',
          payload: {
            kind: 'arp',
            operation: 'reply',
            senderIp: iface.ip!,
            senderMac: iface.mac,
            targetIp: a.senderIp,
            targetMac: a.senderMac,
          },
        })
      return
    }
    this.receiveIp(d, interfaceId, frame.payload)
  }
  private receiveIp(d: DeviceConfig, interfaceId: string, incoming: IPv4Packet): void {
    let packet = incoming
    for (const extension of this.extensions)
      packet = extension.inbound?.(this, d.id, packet, interfaceId) ?? packet
    const local =
      packet.destination === '255.255.255.255' ||
      d.interfaces.some((i) => i.up && i.ip === packet.destination)
    if (!local) {
      if (d.kind !== 'router') {
        this.drop(d.id, 'not-local', packet)
        return
      }
      if (packet.ttl <= 1) {
        this.drop(d.id, 'ttl-expired', packet)
        this.icmpError(d, packet, 'time-exceeded')
        return
      }
      const next = { ...packet, ttl: packet.ttl - 1 }
      this.trace({
        protocol: 'Routing',
        type: 'forward',
        deviceId: d.id,
        packetId: packet.id,
        before: packet,
        after: next,
        message: `Forward IPv4 TTL ${packet.ttl} → ${next.ttl}`,
      })
      this.route(d, next)
      return
    }
    this.trace({
      protocol: packet.payload.kind.toUpperCase() as 'ICMP' | 'UDP' | 'TCP',
      type: 'receive',
      deviceId: d.id,
      interfaceId,
      packetId: packet.id,
      flowId: packet.flowId,
      after: packet,
      message: `IPv4 received TTL=${packet.ttl}`,
    })
    if (packet.payload.kind !== 'icmp') {
      for (const extension of this.extensions)
        if (extension.receive(this, d.id, packet, interfaceId)) return
      return
    }
    const icmp = packet.payload
    if (icmp.type === 'echo-request') {
      this.sendIp(
        d.id,
        packet.source,
        { ...icmp, type: 'echo-reply' },
        { sourceIp: packet.destination, flowId: packet.flowId },
      )
      return
    }
    const identifier = icmp.original?.identifier ?? icmp.identifier,
      probe = this.probes.get(identifier)
    if (!probe || probe.deviceId !== d.id) return
    probe.cancel()
    this.probes.delete(identifier)
    const elapsed = ((this.nowUs - probe.start) / 1000).toFixed(3)
    this.print(
      d.id,
      probe.hop
        ? `${probe.hop}  ${packet.source}  ${elapsed} ms (${icmp.type})`
        : icmp.type === 'echo-reply'
          ? `Reply from ${packet.source}: TTL=${packet.ttl} time=${elapsed} ms`
          : `${icmp.type} from ${packet.source}. Check routing and gateway configuration.`,
    )
    if (probe.hop && icmp.type === 'time-exceeded' && probe.hop < 30)
      this.probe(d.id, probe.destination, probe.hop + 1)
  }
  private icmpError(
    d: DeviceConfig,
    packet: IPv4Packet,
    type: 'unreachable' | 'time-exceeded',
  ): void {
    if (
      packet.source === '0.0.0.0' ||
      packet.destination === '255.255.255.255' ||
      (packet.payload.kind === 'icmp' && packet.payload.type !== 'echo-request')
    )
      return
    if (!selectRoute(d, packet.source)) return
    const p = packet.payload
    const message: ICMPMessage = {
      kind: 'icmp',
      type,
      identifier: p.kind === 'icmp' ? p.identifier : packet.id,
      sequence: p.kind === 'icmp' ? p.sequence : 0,
      data: '',
      original: {
        source: packet.source,
        destination: packet.destination,
        identifier: p.kind === 'icmp' ? p.identifier : packet.id,
        sequence: p.kind === 'icmp' ? p.sequence : 0,
      },
    }
    this.sendIp(d.id, packet.source, message, { flowId: packet.flowId })
  }
  private probe(deviceId: string, destination: string, hop?: number): void {
    const identifier = this.id('probe')
    const cancel = this.schedule(5000000, () => {
      this.probes.delete(identifier)
      this.print(
        deviceId,
        hop
          ? `${hop}  *  Request timed out`
          : `Request to ${destination} timed out. Check links, addresses and return routes.`,
      )
      if (hop && hop < 30) this.probe(deviceId, destination, hop + 1)
    })
    this.probes.set(identifier, { deviceId, destination, start: this.nowUs, cancel, hop })
    this.sendIp(
      deviceId,
      destination,
      { kind: 'icmp', type: 'echo-request', identifier, sequence: hop ?? 1, data: 'NetLab probe' },
      { ttl: hop ?? 64 },
    )
  }
  command(deviceId: string, text: string): void {
    const d = this.device(deviceId)
    if (!d) return
    const [verb, destination] = text.trim().split(/\s+/)
    if (verb === 'ping' && destination && ipv4(destination) !== undefined) {
      this.probe(deviceId, destination)
      return
    }
    if (
      (verb === 'traceroute' || verb === 'tracert') &&
      destination &&
      ipv4(destination) !== undefined
    ) {
      this.probe(deviceId, destination, 1)
      return
    }
    if (verb === 'ipconfig' || verb === 'ifconfig' || (verb === 'ip' && destination === 'addr')) {
      for (const i of d.interfaces)
        this.print(
          deviceId,
          `${i.name}: ${i.up ? 'UP' : 'DOWN'} ${i.ip ?? 'unassigned'}/${i.prefix ?? 24} MAC ${i.mac} gateway ${i.gateway ?? 'none'}`,
        )
      return
    }
    if (verb === 'route' || (verb === 'ip' && destination === 'route')) {
      for (const r of routesFor(d))
        this.print(
          deviceId,
          `${r.network}/${r.prefix} via ${r.gateway ?? 'connected'} dev ${r.interfaceId} metric ${r.metric}`,
        )
      return
    }
    if (verb === 'arp') {
      this.expire()
      for (const a of this.arp.get(deviceId) ?? [])
        this.print(deviceId, `${a.ip} ${a.mac} ${a.interfaceId}`)
      return
    }
    if (verb === 'clear') {
      this.lines = this.lines.filter((l) => l.deviceId !== deviceId)
      return
    }
    for (const extension of this.extensions) if (extension.command?.(this, deviceId, text)) return
    this.print(
      deviceId,
      'Commands: ping <IPv4/name>, traceroute <IPv4>, ipconfig, route, arp, clear. Configure addresses and routes in the inspector.',
    )
  }
}
