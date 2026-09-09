import type { Diagnostic, NetworkDocument } from '../contracts'
export function diagnose(document: NetworkDocument): Diagnostic[] {
  const parent = new Map<string, string>()
  const root = (s: string): string => {
    const p = parent.get(s)
    if (!p) {
      parent.set(s, s)
      return s
    }
    if (p === s) return s
    const r = root(p)
    parent.set(s, r)
    return r
  }
  const join = (a: string, b: string): boolean => {
    const x = root(a),
      y = root(b)
    if (x === y) return false
    parent.set(x, y)
    return true
  }
  const key = (d: string, i: string) => `${d}/${i}`
  const result: Diagnostic[] = []
  for (const d of document.devices)
    if (d.kind === 'switch')
      for (const i of d.interfaces.slice(1)) join(key(d.id, d.interfaces[0].id), key(d.id, i.id))
  for (const l of document.links)
    if (!join(key(l.a.deviceId, l.a.interfaceId), key(l.b.deviceId, l.b.interfaceId)))
      result.push({
        code: 'L2_LOOP',
        message: 'Ethernet loop detected. Remove a redundant switch link; STP is not simulated.',
      })
  const addresses = new Map<string, string>()
  for (const d of document.devices)
    for (const i of d.interfaces)
      if (i.ip) {
        const address = `${root(key(d.id, i.id))}/${i.ip}`
        if (addresses.has(address))
          result.push({
            code: 'DUPLICATE_IP',
            message: `Duplicate IP ${i.ip} in one Ethernet segment. Assign unique addresses.`,
            deviceId: d.id,
            interfaceId: i.id,
          })
        addresses.set(address, i.id)
      }
  return result
}
