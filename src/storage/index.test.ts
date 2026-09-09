import { describe, expect, it } from 'vitest'
import { examples, createDevice, duplicateDevice } from '../examples'
import {
  exportDocument,
  importDocument,
  loadAutosave,
  saveAutosave,
  validateDocument,
} from './index'
import type { NetworkDocument } from '../core/contracts'
const fixture = () => structuredClone(examples[0].document)
describe('project persistence', () => {
  it.each(examples)('roundtrips every configuration field in $id', (example) => {
    expect(importDocument(exportDocument(example.document))).toEqual(example.document)
  })
  it('keeps an active document unchanged when import fails', () => {
    const active = fixture(),
      before = structuredClone(active)
    const invalid = fixture()
    invalid.links[0].a.interfaceId = 'missing'
    expect(() => importDocument(JSON.stringify(invalid))).toThrow(/missing/)
    expect(active).toEqual(before)
  })
  it('strips runtime data recursively', () => {
    const doc = fixture()
    Object.assign(doc, { trace: ['secret'], caches: {} })
    Object.assign(doc.devices[0], { leases: [] })
    expect(exportDocument(doc)).not.toMatch(/secret|trace|caches|leases/)
  })
  it('rejects malformed, future and oversized input', () => {
    expect(() => importDocument('{')).toThrow(/JSON/)
    expect(() => validateDocument({ ...fixture(), schemaVersion: 2 })).toThrow(/Upgrade/)
    expect(() => importDocument(' '.repeat(2 * 1024 * 1024 + 1))).toThrow(/2 MB/)
  })
  it('rejects duplicate IDs, MACs, bad coordinates and occupied ports', () => {
    const doc = fixture()
    doc.devices[1].id = doc.devices[0].id
    expect(() => validateDocument(doc)).toThrow(/Duplicate ID/)
    const mac = fixture()
    mac.devices[1].interfaces[0].mac = mac.devices[0].interfaces[0].mac
    expect(() => validateDocument(mac)).toThrow(/Duplicate MAC/)
    const coord = fixture()
    coord.devices[0].position.x = Infinity
    expect(() => validateDocument(coord)).toThrow()
    const occupied = fixture()
    occupied.links.push({ ...occupied.links[0], id: 'extra' })
    expect(() => validateDocument(occupied)).toThrow(/occupied/)
  })
  it('allows isolated duplicate IPs but rejects duplicates on one L2 domain', () => {
    const doc = fixture()
    doc.devices[1].interfaces[0].ip = doc.devices[0].interfaces[0].ip
    expect(() => validateDocument(doc)).toThrow(/Duplicate IP/)
    doc.links = []
    expect(validateDocument(doc)).toEqual(doc)
  })
  it('rejects loops even if all physical ports differ', () => {
    const doc: NetworkDocument = { schemaVersion: 1, name: 'loop', seed: 1, devices: [], links: [] }
    for (let i = 0; i < 3; i++) doc.devices.push(createDevice('switch', doc.devices))
    for (let i = 0; i < 3; i++)
      doc.links.push({
        id: `l${i}`,
        a: { deviceId: doc.devices[i].id, interfaceId: doc.devices[i].interfaces[0].id },
        b: {
          deviceId: doc.devices[(i + 1) % 3].id,
          interfaceId: doc.devices[(i + 1) % 3].interfaces[1].id,
        },
        latencyMs: 1,
        bandwidthMbps: 100,
        lossPercent: 0,
        queueCapacity: 10,
        up: true,
      })
    expect(() => validateDocument(doc)).toThrow(/loop/)
  })
  it('accepts incomplete L3 and /31 or /32 endpoint addresses', () => {
    const doc = fixture()
    doc.links = []
    Object.assign(doc.devices[0].interfaces[0], { ip: '10.0.0.0', prefix: 31, gateway: '10.0.0.1' })
    Object.assign(doc.devices[1].interfaces[0], { ip: '10.0.0.2', prefix: 32 })
    expect(() => validateDocument(doc)).not.toThrow()
    delete doc.devices[0].interfaces[0].ip
    delete doc.devices[0].interfaces[0].prefix
    delete doc.devices[0].interfaces[0].gateway
    expect(() => validateDocument(doc)).not.toThrow()
  })
  it('rejects subnet broadcast hosts and off-subnet next hops', () => {
    const doc = fixture()
    doc.devices[0].interfaces[0].ip = '192.168.1.255'
    expect(() => validateDocument(doc)).toThrow(/broadcast/)
    const routed = structuredClone(examples[2].document)
    routed.devices.find((d) => d.id === 'r1')!.routes[0].gateway = '10.1.0.2'
    expect(() => validateDocument(routed)).toThrow(/next hop/)
  })
  it('bounds DHCP pools and service ports', () => {
    const dhcp = structuredClone(examples[3].document)
    dhcp.devices.find((d) => d.dhcp)!.dhcp!.end = '192.168.2.110'
    expect(() => validateDocument(dhcp)).toThrow(/254/)
    const doc = fixture()
    doc.devices[1].services!.udpEcho = 65536
    expect(() => validateDocument(doc)).toThrow()
  })
  it('creates unique local-admin addresses and duplicates without L3 conflicts', () => {
    const doc = fixture(),
      clone = duplicateDevice(doc.devices[0], doc.devices)
    expect(clone.id).not.toBe(doc.devices[0].id)
    expect(clone.interfaces[0].mac).not.toBe(doc.devices[0].interfaces[0].mac)
    expect(clone.interfaces[0].mac.startsWith('02:')).toBe(true)
    expect(clone.interfaces[0].ip).toBeUndefined()
    expect(clone.routes).toEqual([])
    doc.devices.push(clone)
    expect(() => validateDocument(doc)).not.toThrow()
    expect(createDevice('router', doc.devices).interfaces).toHaveLength(4)
  })
  it.each(['pc2', 'pc2-eth0'])(
    'reserves imported link ID %s when adding or duplicating',
    (linkId) => {
      const doc = fixture()
      doc.links[0].id = linkId
      expect(() => validateDocument(doc)).not.toThrow()
      const occupiedIds = doc.links.map((link) => link.id)
      const created = createDevice('pc', doc.devices, undefined, occupiedIds)
      const duplicate = duplicateDevice(doc.devices[0], doc.devices, occupiedIds)
      for (const device of [created, duplicate]) {
        expect(device.id).toBe('pc3')
        expect(() =>
          importDocument(exportDocument({ ...doc, devices: [...doc.devices, device] })),
        ).not.toThrow()
      }
    },
  )
  it('propagates unavailable autosave storage errors', async () => {
    await expect(saveAutosave(fixture())).rejects.toThrow(/IndexedDB/)
    await expect(loadAutosave()).rejects.toThrow(/IndexedDB/)
  })
})
