import { createNatState } from './nat'
import type {
  IPv4Packet,
  ProtocolExtension,
  SimulationHost,
  TCPMessage,
  UDPMessage,
} from '../../contracts'

const SECOND = 1_000_000
const bytes = (s: string) => new TextEncoder().encode(s).length
const ipNumber = (s: string) => s.split('.').reduce((n, v) => n * 256 + Number(v), 0)
const numberIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')
const numeric = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)
interface Connection {
  id: string
  device: string
  localPort: number
  remoteIp: string
  remotePort: number
  state: string
  sendNext: number
  receiveNext: number
  pending?: TCPMessage
  attempts: number
  generation: number
  http?: string
}
interface Lease {
  client: string
  address: string
  expiresAtUs: number
  state: string
}
interface Envelope {
  service: string
  type: string
  tx: string
  hostname?: string
  address?: string
  client?: string
  server?: string
  prefix?: number
  gateway?: string
  dns?: string
  leaseSeconds?: number
}

/** Each factory owns an independent run state; packets always travel through sendIp. */
export function createServicesExtension(): ProtocolExtension {
  const connections = new Map<string, Connection>()
  const cache = new Map<string, { hostname: string; address: string; expiresAtUs: number }>()
  const queries = new Map<
    string,
    { device: string; hostname: string; server: string; port: number; done: (ip: string) => void }
  >()
  const leases = new Map<string, Map<string, Lease>>()
  const dhcpRequests = new Map<
    string,
    { device: string; iface: string; client: string; server?: string; address?: string }
  >()
  const udpClients = new Set<string>()
  let nextPort = 49152
  let epoch = 0
  const port = () => {
    const value = nextPort++
    if (nextPort > 65535) nextPort = 49152
    return value
  }
  const device = (h: SimulationHost, id: string) => h.document.devices.find((d) => d.id === id)!
  const tables = (h: SimulationHost, id: string) => {
    h.setTable(
      `tcp:${id}`,
      [...connections.values()]
        .filter((c) => c.device === id)
        .map((c) => ({
          id: c.id,
          state: c.state,
          localPort: c.localPort,
          remoteIp: c.remoteIp,
          remotePort: c.remotePort,
          sendNext: c.sendNext,
          receiveNext: c.receiveNext,
        })),
    )
    h.setTable(
      `dns:${id}`,
      [...cache.entries()]
        .filter(([k, v]) => k.startsWith(`${id}|`) && v.expiresAtUs > h.nowUs)
        .map(([, v]) => ({ ...v })),
    )
    h.setTable(
      `dhcp:${id}`,
      [
        ...(leases.get(id)?.values() ?? []),
        ...device(h, id).interfaces.flatMap((i) => [
          ...(leases.get(`client:${id}:${i.id}`)?.values() ?? []),
        ]),
      ]
        .filter((l) => l.expiresAtUs > h.nowUs)
        .map((l) => ({ ...l })),
    )
    h.setTable(`nat:${id}`, natState.rows(id))
  }
  const later = (h: SimulationHost, delay: number, fn: () => void) => {
    const e = epoch
    h.schedule(delay, () => {
      if (e === epoch) fn()
    })
  }
  const udp = (
    h: SimulationHost,
    id: string,
    destination: string,
    sourcePort: number,
    destinationPort: number,
    data: string,
    options = {},
  ) => h.sendIp(id, destination, { kind: 'udp', sourcePort, destinationPort, data }, options)
  const envelope = (p: UDPMessage): Envelope | undefined => {
    try {
      const v: unknown = JSON.parse(p.data)
      if (v && typeof v === 'object' && 'service' in v && 'tx' in v && 'type' in v)
        return v as Envelope
    } catch {
      /* ordinary UDP */
    }
    return undefined
  }
  const sendTcp = (
    h: SimulationHost,
    c: Connection,
    flags: TCPMessage['flags'],
    data = '',
    reliable = false,
  ) => {
    const p: TCPMessage = {
      kind: 'tcp',
      sourcePort: c.localPort,
      destinationPort: c.remotePort,
      sequence: c.sendNext,
      acknowledgment: c.receiveNext,
      flags,
      data,
    }
    if (reliable) {
      c.sendNext += bytes(data) + Number(flags.includes('SYN')) + Number(flags.includes('FIN'))
      c.pending = p
      c.attempts = 0
      const generation = ++c.generation
      const retry = () => {
        if (!c.pending || generation !== c.generation) return
        if (++c.attempts > 3) {
          c.pending = undefined
          c.state = 'TIMED-OUT'
          h.print(c.device, `TCP ${c.id}: timeout (retry limit)`)
          tables(h, c.device)
          return
        }
        h.trace({
          deviceId: c.device,
          protocol: 'TCP',
          type: 'retransmit',
          message: `Retransmit ${c.id}, attempt ${c.attempts}`,
        })
        h.sendIp(c.device, c.remoteIp, p)
        later(h, SECOND, retry)
      }
      later(h, SECOND, retry)
    }
    h.sendIp(c.device, c.remoteIp, p)
    tables(h, c.device)
  }
  const connect = (
    h: SimulationHost,
    id: string,
    ip: string,
    remotePort: number,
    http?: string,
  ) => {
    const c: Connection = {
      id: h.id('tcp'),
      device: id,
      localPort: port(),
      remoteIp: ip,
      remotePort,
      state: 'SYN-SENT',
      sendNext: 1000,
      receiveNext: 0,
      attempts: 0,
      generation: 0,
      http,
    }
    connections.set(c.id, c)
    h.print(id, `TCP connection ${c.id}`)
    sendTcp(h, c, ['SYN'], '', true)
  }
  const resolve = (h: SimulationHost, id: string, hostname: string, done: (ip: string) => void) => {
    if (numeric(hostname)) {
      done(hostname)
      return
    }
    hostname = hostname.toLowerCase()
    const found = cache.get(`${id}|${hostname}`)
    if (found && found.expiresAtUs > h.nowUs) {
      h.print(id, `DNS cache: ${hostname} = ${found.address}`)
      done(found.address)
      return
    }
    const server = device(h, id).interfaces.find((i) => i.up && i.dns)?.dns
    if (!server) {
      h.print(id, 'DNS: no resolver configured')
      return
    }
    const tx = h.id('dns')
    const sourcePort = port()
    queries.set(tx, { device: id, hostname, server, port: sourcePort, done })
    udp(
      h,
      id,
      server,
      sourcePort,
      53,
      JSON.stringify({ service: 'dns', type: 'query', tx, hostname }),
    )
    h.trace({ deviceId: id, protocol: 'DNS', type: 'query', message: `A ${hostname}` })
    later(h, 3 * SECOND, () => {
      if (queries.delete(tx)) h.print(id, `DNS timeout: ${hostname}`)
    })
  }
  const receiveTcp = (h: SimulationHost, id: string, packet: IPv4Packet, p: TCPMessage) => {
    let c = [...connections.values()].find(
      (c) =>
        c.device === id &&
        c.remoteIp === packet.source &&
        c.remotePort === p.sourcePort &&
        c.localPort === p.destinationPort &&
        c.state !== 'CLOSED' &&
        c.state !== 'TIMED-OUT',
    )
    if (p.flags.includes('RST')) {
      if (c) {
        c.state = 'CLOSED'
        c.pending = undefined
        tables(h, id)
        h.print(id, `TCP ${c.id}: reset`)
      }
      return
    }
    if (!c) {
      const services = device(h, id).services
      if (
        !p.flags.includes('SYN') ||
        (services?.tcpEcho !== p.destinationPort && !(services?.http && p.destinationPort === 80))
      ) {
        h.sendIp(id, packet.source, {
          kind: 'tcp',
          sourcePort: p.destinationPort,
          destinationPort: p.sourcePort,
          sequence: p.acknowledgment,
          acknowledgment:
            p.sequence +
            bytes(p.data) +
            Number(p.flags.includes('SYN')) +
            Number(p.flags.includes('FIN')),
          flags: ['RST', 'ACK'],
          data: '',
        })
        return
      }
      c = {
        id: h.id('tcp'),
        device: id,
        localPort: p.destinationPort,
        remoteIp: packet.source,
        remotePort: p.sourcePort,
        state: 'SYN-RECEIVED',
        sendNext: 2000,
        receiveNext: p.sequence + 1,
        attempts: 0,
        generation: 0,
      }
      connections.set(c.id, c)
      sendTcp(h, c, ['SYN', 'ACK'], '', true)
      return
    }
    if (
      p.flags.includes('ACK') &&
      c.pending &&
      p.acknowledgment === c.sendNext &&
      (c.state !== 'SYN-SENT' || p.flags.includes('SYN'))
    ) {
      c.pending = undefined
      c.generation++
      if (c.state === 'SYN-RECEIVED') c.state = 'ESTABLISHED'
      else if (c.state === 'FIN-WAIT-1') c.state = 'FIN-WAIT-2'
      else if (c.state === 'LAST-ACK') c.state = 'CLOSED'
    }
    if (
      c.state === 'SYN-SENT' &&
      p.flags.includes('SYN') &&
      p.flags.includes('ACK') &&
      p.acknowledgment === c.sendNext
    ) {
      c.receiveNext = p.sequence + 1
      c.state = 'ESTABLISHED'
      sendTcp(h, c, ['ACK'])
      h.print(id, `TCP ${c.id}: ESTABLISHED`)
      if (c.http) sendTcp(h, c, ['ACK'], `GET / HTTP/1.0\r\nHost: ${c.http}\r\n\r\n`, true)
      return
    }
    if (p.flags.includes('SYN')) {
      if (c.pending) h.sendIp(id, c.remoteIp, c.pending)
      else sendTcp(h, c, ['ACK'])
      return
    }
    // Handshake must finish before application bytes or close can be accepted.
    if (c.state === 'SYN-SENT' || c.state === 'SYN-RECEIVED' || c.state === 'CLOSED') {
      tables(h, id)
      return
    }
    if (p.data || p.flags.includes('FIN')) {
      if (p.sequence !== c.receiveNext) {
        sendTcp(h, c, ['ACK'])
        return
      }
      c.receiveNext += bytes(p.data) + Number(p.flags.includes('FIN'))
      sendTcp(h, c, ['ACK'])
      if (p.data) {
        h.print(id, `TCP ${c.id} received: ${p.data}`)
        const s = device(h, id).services
        if (!c.pending && (s?.tcpEcho === c.localPort || (s?.http && c.localPort === 80)))
          sendTcp(
            h,
            c,
            ['ACK'],
            c.localPort === 80 && s?.http
              ? 'HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\n\r\nHello from NetLab'
              : p.data,
            true,
          )
      }
      if (p.flags.includes('FIN')) {
        if (c.state.startsWith('FIN-WAIT')) {
          c.state = 'TIME-WAIT'
          later(h, 2 * SECOND, () => {
            c!.state = 'CLOSED'
            tables(h, id)
          })
        } else {
          c.state = 'LAST-ACK'
          sendTcp(h, c, ['FIN', 'ACK'], '', true)
        }
      }
    }
    tables(h, id)
  }
  const receiveDhcp = (
    h: SimulationHost,
    id: string,
    packet: IPv4Packet,
    p: UDPMessage,
    e: Envelope,
    iface: string,
  ) => {
    const d = device(h, id)
    const config = d.dhcp
    h.trace({
      deviceId: id,
      interfaceId: iface,
      protocol: 'DHCP',
      type: e.type,
      message: `DHCP ${e.type} ${e.client ?? ''}`,
    })
    if (config?.enabled && p.destinationPort === 67 && typeof e.client === 'string') {
      let pool = leases.get(id)
      if (!pool) {
        pool = new Map()
        leases.set(id, pool)
      }
      for (const [key, l] of pool) if (l.expiresAtUs <= h.nowUs) pool.delete(key)
      let l = pool.get(e.client)
      if (e.type === 'discover') {
        if (!l) {
          const used = new Set([...pool.values()].map((l) => l.address))
          let value = ipNumber(config.start)
          const end = ipNumber(config.end)
          while (value <= end && used.has(numberIp(value))) value++
          if (value > end) {
            h.print(id, 'DHCP pool exhausted')
            tables(h, id)
            return
          }
          l = {
            client: e.client,
            address: numberIp(value),
            expiresAtUs: h.nowUs + 5 * SECOND,
            state: 'OFFERED',
          }
          pool.set(e.client, l)
        }
      } else if (e.type === 'request') {
        if (e.server && !d.interfaces.some((i) => i.ip === e.server)) return
        if (!l || l.address !== e.address) return
        l.state = 'BOUND'
        l.expiresAtUs = h.nowUs + config.leaseSeconds * SECOND
      } else return
      const server = d.interfaces.find((i) => i.id === iface)?.ip
      if (!server || !l) return
      const expiration = l.expiresAtUs
      const client = e.client
      later(h, Math.max(0, expiration - h.nowUs), () => {
        if (pool!.get(client)?.expiresAtUs === expiration) {
          pool!.delete(client)
          tables(h, id)
        }
      })
      udp(
        h,
        id,
        '255.255.255.255',
        67,
        68,
        JSON.stringify({
          service: 'dhcp',
          type: e.type === 'discover' ? 'offer' : 'ack',
          tx: e.tx,
          client: e.client,
          address: l.address,
          server,
          prefix: config.prefix,
          gateway: config.gateway,
          dns: config.dns,
          leaseSeconds: config.leaseSeconds,
        }),
        { interfaceId: iface, sourceIp: server },
      )
      tables(h, id)
      return
    }
    const request = dhcpRequests.get(e.tx)
    if (
      !request ||
      request.device !== id ||
      request.iface !== iface ||
      request.client !== e.client ||
      p.destinationPort !== 68 ||
      p.sourcePort !== 67
    )
      return
    if (e.type === 'offer' && e.address && e.server && !request.server) {
      request.server = e.server
      request.address = e.address
      udp(h, id, '255.255.255.255', 68, 67, JSON.stringify({ ...e, type: 'request' }), {
        interfaceId: iface,
        sourceIp: '0.0.0.0',
      })
    }
    if (
      e.type === 'ack' &&
      e.address === request.address &&
      e.server === request.server &&
      packet.source === e.server &&
      typeof e.prefix === 'number' &&
      typeof e.leaseSeconds === 'number'
    ) {
      const i = d.interfaces.find((i) => i.id === iface)!
      i.ip = e.address
      i.prefix = e.prefix
      i.gateway = e.gateway
      i.dns = e.dns
      dhcpRequests.delete(e.tx)
      h.print(id, `DHCP lease: ${e.address}`)
      const address = e.address
      const expiresAtUs = h.nowUs + e.leaseSeconds * SECOND
      h.setTable(`dhcp:${id}`, [
        { client: request.client, address: address!, expiresAtUs, state: 'BOUND' },
      ])
      later(h, e.leaseSeconds * SECOND, () => {
        const rows = leases.get(`client:${id}:${iface}`)
        if (rows?.get('lease')?.expiresAtUs !== expiresAtUs) return
        if (i.ip === address) {
          delete i.ip
          delete i.gateway
          delete i.dns
          h.print(id, 'DHCP lease expired')
          h.setTable(`dhcp:${id}`, [])
        }
      })
      leases.set(
        `client:${id}:${iface}`,
        new Map([
          ['lease', { client: request.client, address: address!, expiresAtUs, state: 'BOUND' }],
        ]),
      )
      later(h, (e.leaseSeconds * SECOND) / 2, () => {
        if (leases.get(`client:${id}:${iface}`)?.get('lease')?.expiresAtUs === expiresAtUs)
          h.command(id, 'dhcp renew')
      })
    }
  }
  const natState = createNatState(later, tables)
  return {
    reset(h) {
      epoch++
      connections.clear()
      cache.clear()
      queries.clear()
      leases.clear()
      dhcpRequests.clear()
      natState.reset()
      udpClients.clear()
      nextPort = 49152
      for (const d of h.document.devices) {
        tables(h, d.id)
        if (d.interfaces.some((i) => i.up && i.mode === 'dhcp'))
          later(h, 0, () => h.command(d.id, 'dhcp'))
      }
    },
    inbound(h, id, p, i) {
      return natState.translate(h, id, p, i, true)
    },
    outbound(h, id, p, i) {
      return natState.translate(h, id, p, i, false)
    },
    receive(h, id, packet, iface) {
      const p = packet.payload
      if (p.kind === 'tcp') {
        receiveTcp(h, id, packet, p)
        return true
      }
      if (p.kind !== 'udp') return false
      const e = envelope(p)
      if (e?.service === 'dhcp') {
        receiveDhcp(h, id, packet, p, e, iface)
        return true
      }
      if (e?.service === 'dns') {
        if (
          p.destinationPort === 53 &&
          e.type === 'query' &&
          typeof e.hostname === 'string' &&
          device(h, id).dnsRecords
        ) {
          const address = device(h, id).dnsRecords![e.hostname.toLowerCase()]
          udp(
            h,
            id,
            packet.source,
            53,
            p.sourcePort,
            JSON.stringify({
              service: 'dns',
              type: address ? 'answer' : 'nxdomain',
              tx: e.tx,
              hostname: e.hostname,
              address,
            }),
          )
          h.trace({
            deviceId: id,
            protocol: 'DNS',
            type: address ? 'answer' : 'nxdomain',
            message: address ?? `NXDOMAIN ${e.hostname}`,
          })
        } else {
          const q = queries.get(e.tx)
          if (
            q &&
            q.device === id &&
            q.server === packet.source &&
            q.port === p.destinationPort &&
            p.sourcePort === 53 &&
            q.hostname === e.hostname &&
            ['answer', 'nxdomain'].includes(e.type)
          ) {
            queries.delete(e.tx)
            if (e.type === 'answer' && typeof e.address === 'string' && numeric(e.address)) {
              const value = {
                hostname: q.hostname,
                address: e.address,
                expiresAtUs: h.nowUs + 60 * SECOND,
              }
              cache.set(`${id}|${q.hostname}`, value)
              tables(h, id)
              later(h, 60 * SECOND, () => {
                if (cache.get(`${id}|${q.hostname}`) === value) {
                  cache.delete(`${id}|${q.hostname}`)
                  tables(h, id)
                }
              })
              h.print(id, `${q.hostname} = ${e.address}`)
              q.done(e.address)
            } else h.print(id, `DNS NXDOMAIN: ${q.hostname}`)
          }
        }
        return true
      }
      if (device(h, id).services?.udpEcho === p.destinationPort) {
        h.print(id, `UDP ${p.destinationPort} received: ${p.data}`)
        udp(h, id, packet.source, p.destinationPort, p.sourcePort, p.data)
      } else if (udpClients.has(`${id}:${p.destinationPort}`)) h.print(id, `UDP reply: ${p.data}`)
      else {
        h.trace({
          deviceId: id,
          protocol: 'UDP',
          type: 'no-listener',
          message: `No UDP listener on port ${p.destinationPort}`,
        })
        if (packet.source !== '0.0.0.0' && packet.destination !== '255.255.255.255') {
          h.sendIp(id, packet.source, {
            kind: 'icmp',
            type: 'unreachable',
            identifier: packet.id,
            sequence: 0,
            data: `UDP port ${p.destinationPort} unreachable`,
            original: {
              source: packet.source,
              destination: packet.destination,
              identifier: packet.id,
              sequence: 0,
            },
          })
        }
      }
      return true
    },
    command(h, id, text) {
      const [cmd, arg, arg2, ...rest] = text.trim().split(/\s+/)
      if (cmd === 'udp-send') {
        const p = Number(arg2)
        if (!arg || !Number.isInteger(p) || p < 1 || p > 65535) {
          h.print(id, 'Usage: udp-send ip port text')
          return true
        }
        const local = port()
        udpClients.add(`${id}:${local}`)
        udp(h, id, arg, local, p, rest.join(' '))
        return true
      }
      if (cmd === 'tcp-connect') {
        const p = Number(arg2)
        if (arg && Number.isInteger(p) && p > 0 && p <= 65535) connect(h, id, arg, p)
        else h.print(id, 'Usage: tcp-connect ip port')
        return true
      }
      if (cmd === 'tcp-send' || cmd === 'tcp-close') {
        const c = connections.get(arg)
        if (!c || c.device !== id || c.state !== 'ESTABLISHED' || c.pending) {
          h.print(id, 'TCP: connection not ready')
          return true
        }
        if (cmd === 'tcp-close') {
          c.state = 'FIN-WAIT-1'
          sendTcp(h, c, ['FIN', 'ACK'], '', true)
        } else
          sendTcp(h, c, ['ACK'], [arg2, ...rest].filter((v) => v !== undefined).join(' '), true)
        return true
      }
      if (cmd === 'nslookup' || cmd === 'http-get' || (cmd === 'ping' && arg && !numeric(arg))) {
        if (!arg) {
          h.print(id, `Usage: ${cmd} hostname`)
          return true
        }
        resolve(h, id, arg, (ip) => {
          if (cmd === 'ping') h.command(id, `ping ${ip}`)
          else if (cmd === 'http-get') connect(h, id, ip, 80, arg)
        })
        return true
      }
      if (cmd === 'dhcp') {
        const i = device(h, id).interfaces.find((i) => i.up && i.mode === 'dhcp')
        if (!i) {
          h.print(id, 'DHCP: no enabled DHCP interface')
          return true
        }
        const tx = h.id('dhcp')
        const renew = arg === 'renew' && i.ip
        const server = leases.get(`client:${id}:${i.id}`)?.get('lease')
        const request = {
          device: id,
          iface: i.id,
          client: i.mac,
          server: undefined as string | undefined,
          address: renew ? i.ip : undefined,
        }
        dhcpRequests.set(tx, request)
        let attempts = 0
        const discover = () => {
          if (!dhcpRequests.has(tx)) return
          if (attempts++ >= 4) {
            dhcpRequests.delete(tx)
            h.print(id, 'DHCP timeout: no lease received')
            return
          }
          // Repeat DORA with the same transaction identity; reservations stay stable.
          request.server = undefined
          udp(
            h,
            id,
            '255.255.255.255',
            68,
            67,
            JSON.stringify({
              service: 'dhcp',
              type: 'discover',
              tx,
              client: i.mac,
              ...(server ? { address: server.address } : {}),
            }),
            { interfaceId: i.id, sourceIp: renew ? i.ip : '0.0.0.0' },
          )
          later(h, SECOND, discover)
        }
        discover()
        return true
      }
      return false
    },
  }
}
