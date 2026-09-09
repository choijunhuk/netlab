import type { DeviceConfig, RoutingEntry } from '../contracts'
import { inSubnet, networkAddress } from '../domain/ipv4'
export function routesFor(device: DeviceConfig): RoutingEntry[] {
  const active = device.interfaces.filter((i) => i.up)
  // Stable sorting preserves connected precedence when prefix and metric tie.
  return [
    ...active.flatMap((i) => {
      const prefix = i.prefix ?? 24
      const network = i.ip ? networkAddress(i.ip, prefix) : undefined
      return network ? [{ network, prefix, interfaceId: i.id, metric: 0 }] : []
    }),
    ...device.routes.filter((r) => active.some((i) => i.id === r.interfaceId)),
    ...active.flatMap((i) =>
      i.ip && i.gateway
        ? [
            {
              network: '0.0.0.0',
              prefix: 0,
              gateway: i.gateway,
              interfaceId: i.id,
              metric: 100,
            },
          ]
        : [],
    ),
  ]
}
export function selectRoute(
  device: DeviceConfig,
  destination: string,
  interfaceId?: string,
): RoutingEntry | undefined {
  return routesFor(device)
    .filter(
      (r) =>
        (!interfaceId || r.interfaceId === interfaceId) &&
        inSubnet(destination, r.network, r.prefix),
    )
    .sort((a, b) => b.prefix - a.prefix || a.metric - b.metric)[0]
}
