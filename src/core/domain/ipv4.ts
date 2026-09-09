export function ipv4(value: string): number | undefined {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255))
    return undefined
  return parts.reduce((n, p) => ((n << 8) | Number(p)) >>> 0, 0)
}
export function inSubnet(ip: string, network: string, prefix: number): boolean {
  const a = ipv4(ip),
    b = ipv4(network)
  if (a === undefined || b === undefined || prefix < 0 || prefix > 32) return false
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (a & mask) === (b & mask)
}

export function networkAddress(ip: string, prefix: number): string | undefined {
  const address = ipv4(ip)
  if (address === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32)
    return undefined
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = (address & mask) >>> 0
  return [24, 16, 8, 0].map((shift) => (network >>> shift) & 255).join('.')
}
