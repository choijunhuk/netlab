import type { DeviceConfig } from '../core/contracts'
import { routesFor } from '../core/routing/routes'

/** The inspector shows the same candidates used by the forwarding engine. */
export function routingRows(device: DeviceConfig) {
  return routesFor(device).map((route) => ({
    network: `${route.network}/${route.prefix}`,
    gateway: route.gateway ?? 'connected',
    interface:
      device.interfaces.find((port) => port.id === route.interfaceId)?.name ?? route.interfaceId,
    metric: route.metric,
  }))
}
