import type { DeviceConfig, RoutingEntry } from '../contracts'
import { inSubnet } from '../domain/ipv4'
export function routesFor(device: DeviceConfig): RoutingEntry[] {
  return [
    ...device.routes,
    ...device.interfaces.flatMap((i) =>
      i.ip
        ? [
            { network: i.ip, prefix: i.prefix ?? 24, interfaceId: i.id, metric: 0 },
            ...(i.gateway
              ? [
                  {
                    network: '0.0.0.0',
                    prefix: 0,
                    gateway: i.gateway,
                    interfaceId: i.id,
                    metric: 100,
                  },
                ]
              : []),
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
        device.interfaces.some((i) => i.id === r.interfaceId && i.up) &&
        inSubnet(destination, r.network, r.prefix),
    )
    .sort((a, b) => b.prefix - a.prefix || a.metric - b.metric)[0]
}
