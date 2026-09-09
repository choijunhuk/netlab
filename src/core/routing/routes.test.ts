import { expect, it } from 'vitest'
import type { DeviceConfig } from '../contracts'
import { routesFor, selectRoute } from './routes'
const device = (): DeviceConfig => ({
  id: 'host',
  name: 'host',
  kind: 'pc',
  position: { x: 0, y: 0 },
  powered: true,
  interfaces: [
    {
      id: 'eth0',
      name: 'eth0',
      ip: '192.168.1.25',
      prefix: 24,
      mac: '02:00:00:00:00:01',
      mode: 'static',
      up: true,
      gateway: '192.168.1.1',
    },
  ],
  routes: [
    {
      network: '192.168.1.0',
      prefix: 24,
      gateway: '192.168.1.254',
      interfaceId: 'eth0',
      metric: 0,
    },
  ],
})
it('projects connected routes with canonical network addresses', () => {
  expect(routesFor(device()).find((r) => !r.gateway)?.network).toBe('192.168.1.0')
})
it('excludes connected, static and default routes on down interfaces', () => {
  const d = device()
  d.interfaces[0].up = false
  expect(routesFor(d)).toEqual([])
})
it('prefers direct connected routes to same-prefix metric-zero static routes', () => {
  expect(selectRoute(device(), '192.168.1.30')).toEqual({
    network: '192.168.1.0',
    prefix: 24,
    interfaceId: 'eth0',
    metric: 0,
  })
})

it('canonicalizes default and host connected route prefixes', () => {
  const d = device()
  d.interfaces[0].prefix = 0
  expect(routesFor(d).find((r) => !r.gateway)?.network).toBe('0.0.0.0')
  d.interfaces[0].prefix = 32
  expect(routesFor(d).find((r) => !r.gateway)?.network).toBe('192.168.1.25')
})
