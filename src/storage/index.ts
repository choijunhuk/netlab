import { z } from 'zod'
import type { NetworkDocument } from '../core/contracts'

const MAX_BYTES = 2 * 1024 * 1024
const id = z.string().min(1).max(100)
const ip = z
  .string()
  .refine(
    (value) =>
      /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value) &&
      value.split('.').every((part) => Number(part) <= 255),
    'Invalid IPv4 address',
  )
const prefix = z.number().int().min(0).max(32)
const finite = z.number().finite()
const mac = z
  .string()
  .regex(/^([\da-fA-F]{2}:){5}[\da-fA-F]{2}$/)
  .refine(
    (value) => (parseInt(value.slice(0, 2), 16) & 1) === 0 && value !== '00:00:00:00:00:00',
    'MAC must be a nonzero unicast address',
  )
const port = z.number().int().min(1).max(65535)
const iface = z.object({
  id,
  name: z.string().min(1).max(100),
  mac,
  ip: ip.optional(),
  prefix: prefix.optional(),
  gateway: ip.optional(),
  dns: ip.optional(),
  mode: z.enum(['static', 'dhcp']),
  up: z.boolean(),
})
const documentSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(200),
  seed: finite,
  devices: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(100),
        kind: z.enum(['pc', 'server', 'switch', 'router']),
        position: z.object({ x: finite, y: finite }),
        powered: z.boolean(),
        interfaces: z.array(iface).min(1).max(64),
        routes: z
          .array(
            z.object({
              network: ip,
              prefix,
              gateway: ip.optional(),
              interfaceId: id,
              metric: z.number().int().min(0).max(65535),
            }),
          )
          .max(256),
        dhcp: z
          .object({
            enabled: z.boolean(),
            start: ip,
            end: ip,
            prefix,
            gateway: ip,
            dns: ip,
            leaseSeconds: z.number().int().min(1).max(31536000),
          })
          .optional(),
        dnsRecords: z
          .record(z.string().min(1).max(253), ip)
          .refine((records) => Object.keys(records).length <= 256, 'At most 256 DNS records')
          .optional(),
        services: z
          .object({
            udpEcho: port.optional(),
            tcpEcho: port.optional(),
            http: z.boolean().optional(),
          })
          .optional(),
        nat: z
          .object({ enabled: z.boolean(), inside: z.array(id).max(64), outside: id })
          .optional(),
      }),
    )
    .max(100),
  links: z
    .array(
      z.object({
        id,
        a: z.object({ deviceId: id, interfaceId: id }),
        b: z.object({ deviceId: id, interfaceId: id }),
        latencyMs: finite.min(0).max(60000),
        bandwidthMbps: finite.positive().max(1000000),
        lossPercent: finite.min(0).max(100),
        queueCapacity: z.number().int().min(1).max(100000),
        up: z.boolean(),
      }),
    )
    .max(200),
})
const numericIp = (value: string) =>
  value.split('.').reduce((sum, part) => sum * 256 + Number(part), 0)
const subnet = (value: string, bits: number) => Math.floor(numericIp(value) / 2 ** (32 - bits))
const usable = (value: string, bits: number) =>
  bits >= 31 ||
  (numericIp(value) % 2 ** (32 - bits) !== 0 &&
    numericIp(value) % 2 ** (32 - bits) !== 2 ** (32 - bits) - 1)
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/** Returns a detached, configuration-only document; never mutates its input. */
export function validateDocument(value: unknown): NetworkDocument {
  if (
    value &&
    typeof value === 'object' &&
    'schemaVersion' in value &&
    typeof value.schemaVersion === 'number' &&
    value.schemaVersion > 1
  )
    throw new Error(
      `Project version ${value.schemaVersion} is newer than supported version 1. Upgrade NetLab to open it.`,
    )
  const result = documentSchema.safeParse(value)
  if (!result.success)
    throw new Error(
      `Invalid project: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    )
  const doc = result.data
  const ids = new Set<string>(),
    macs = new Set<string>(),
    occupied = new Set<string>()
  const parent = new Map<string, string>()
  const unique = (value: string) => {
    ensure(!ids.has(value), `Duplicate ID: ${value}`)
    ids.add(value)
  }
  const root = (value: string): string => {
    const next = parent.get(value)
    return next && next !== value ? root(next) : value
  }
  const join = (a: string, b: string) => {
    const ra = root(a),
      rb = root(b)
    ensure(ra !== rb, 'Layer 2 loop detected; STP is not supported')
    parent.set(ra, rb)
  }
  for (const device of doc.devices) {
    unique(device.id)
    for (const intf of device.interfaces) {
      unique(intf.id)
      parent.set(intf.id, intf.id)
      const address = intf.mac.toLowerCase()
      ensure(!macs.has(address), `Duplicate MAC: ${address}`)
      macs.add(address)
      ensure(
        (intf.ip === undefined) === (intf.prefix === undefined),
        `${intf.id}: IP and prefix must be provided together`,
      )
      ensure(
        device.kind !== 'switch' ||
          (!intf.ip && !intf.gateway && !intf.dns && intf.mode === 'static'),
        'Switch ports cannot have L3 settings',
      )
      if (intf.ip && intf.prefix !== undefined) {
        ensure(
          usable(intf.ip, intf.prefix),
          `${intf.id}: network or broadcast address is not a host`,
        )
        if (intf.gateway)
          ensure(
            intf.gateway !== intf.ip &&
              usable(intf.gateway, intf.prefix) &&
              subnet(intf.gateway, intf.prefix) === subnet(intf.ip, intf.prefix),
            `${intf.id}: gateway must be another host on the interface subnet`,
          )
      }
    }
    if (device.kind === 'switch')
      for (const intf of device.interfaces.slice(1)) join(device.interfaces[0].id, intf.id)
    for (const route of device.routes) {
      const intf = device.interfaces.find((item) => item.id === route.interfaceId)
      ensure(intf, `${device.id}: route references missing interface`)
      ensure(
        numericIp(route.network) % 2 ** (32 - route.prefix) === 0,
        `${device.id}: route network must be a network address`,
      )
      if (route.gateway && intf.ip && intf.prefix !== undefined)
        ensure(
          route.gateway !== intf.ip &&
            usable(route.gateway, intf.prefix) &&
            subnet(route.gateway, intf.prefix) === subnet(intf.ip, intf.prefix),
          `${device.id}: route next hop must be on the selected interface subnet`,
        )
    }
    if (device.nat) {
      const nat = device.nat
      ensure(device.kind === 'router', 'NAT requires a router')
      ensure(
        nat.inside.length > 0 &&
          new Set(nat.inside).size === nat.inside.length &&
          !nat.inside.includes(nat.outside),
        'NAT inside/outside must be distinct',
      )
      ensure(
        [...nat.inside, nat.outside].every((value) =>
          device.interfaces.some((intf) => intf.id === value),
        ),
        'NAT references missing interface',
      )
    }
    if (device.dhcp) {
      const dhcp = device.dhcp,
        count = numericIp(dhcp.end) - numericIp(dhcp.start) + 1
      ensure(count > 0 && count <= 254, 'DHCP pool must contain 1 to 254 addresses')
      ensure(
        subnet(dhcp.start, dhcp.prefix) === subnet(dhcp.end, dhcp.prefix) &&
          usable(dhcp.start, dhcp.prefix) &&
          usable(dhcp.end, dhcp.prefix),
        'DHCP pool must contain usable addresses in one subnet',
      )
      ensure(
        subnet(dhcp.gateway, dhcp.prefix) === subnet(dhcp.start, dhcp.prefix) &&
          usable(dhcp.gateway, dhcp.prefix),
        'DHCP gateway must be on the pool subnet',
      )
      ensure(
        !(
          numericIp(dhcp.gateway) >= numericIp(dhcp.start) &&
          numericIp(dhcp.gateway) <= numericIp(dhcp.end)
        ),
        'DHCP pool must exclude the gateway',
      )
      ensure(
        device.interfaces.every(
          (intf) =>
            !intf.ip ||
            numericIp(intf.ip) < numericIp(dhcp.start) ||
            numericIp(intf.ip) > numericIp(dhcp.end),
        ),
        'DHCP pool must exclude server interface addresses',
      )
      ensure(
        device.interfaces.some(
          (intf) =>
            intf.mode === 'static' &&
            intf.ip &&
            intf.prefix === dhcp.prefix &&
            subnet(intf.ip, dhcp.prefix) === subnet(dhcp.start, dhcp.prefix),
        ),
        'DHCP server needs a static interface on the pool subnet',
      )
    }
  }
  for (const link of doc.links) {
    unique(link.id)
    for (const endpoint of [link.a, link.b]) {
      ensure(
        doc.devices
          .find((device) => device.id === endpoint.deviceId)
          ?.interfaces.some((intf) => intf.id === endpoint.interfaceId),
        `Link ${link.id}: missing device or interface`,
      )
      ensure(
        !occupied.has(endpoint.interfaceId),
        `Port ${endpoint.interfaceId} is already occupied`,
      )
      occupied.add(endpoint.interfaceId)
    }
    ensure(
      link.a.deviceId !== link.b.deviceId,
      `Link ${link.id}: cannot connect a device to itself`,
    )
    join(link.a.interfaceId, link.b.interfaceId)
  }
  const addresses = new Set<string>()
  for (const device of doc.devices)
    for (const intf of device.interfaces)
      if (intf.ip) {
        const key = `${root(intf.id)}:${intf.ip}`
        ensure(!addresses.has(key), `Duplicate IP ${intf.ip} in one Layer 2 domain`)
        addresses.add(key)
      }
  return doc
}
export function importDocument(text: string): NetworkDocument {
  ensure(
    new TextEncoder().encode(text).byteLength <= MAX_BYTES,
    'Project exceeds the 2 MB size limit',
  )
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Invalid project JSON')
  }
  return validateDocument(value)
}
export function exportDocument(doc: NetworkDocument): string {
  const text = JSON.stringify(validateDocument(doc), null, 2)
  ensure(
    new TextEncoder().encode(text).byteLength <= MAX_BYTES,
    'Project exceeds the 2 MB size limit',
  )
  return text
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable; export JSON to save your project'))
      return
    }
    const request = indexedDB.open('netlab-projects', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('documents')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open autosave database'))
    request.onblocked = () => reject(new Error('Autosave database is blocked by another tab'))
  })
}
export async function saveAutosave(doc: NetworkDocument): Promise<void> {
  const text = exportDocument(doc),
    db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite')
      transaction.objectStore('documents').put(text, 'autosave')
      transaction.oncomplete = () => resolve()
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error ?? new Error('Autosave transaction failed'))
    })
  } finally {
    db.close()
  }
}
export async function loadAutosave(): Promise<NetworkDocument | null> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readonly'),
        request = transaction.objectStore('documents').get('autosave')
      transaction.oncomplete = () => {
        try {
          resolve(request.result === undefined ? null : importDocument(request.result))
        } catch (error) {
          reject(error)
        }
      }
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error ?? new Error('Autosave read failed'))
    })
  } finally {
    db.close()
  }
}
