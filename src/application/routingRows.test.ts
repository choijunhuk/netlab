import { expect, it } from 'vitest'
import { examples } from '../examples'
import { routingRows } from './routingRows'
it('shows the actual gateway default route and excludes disabled interfaces', () => {
  const client = structuredClone(
    examples
      .find((lab) => lab.id === 'two-routers')!
      .document.devices.find((device) => device.id === 'pc1')!,
  )
  expect(routingRows(client)).toContainEqual({
    network: '0.0.0.0/0',
    gateway: '192.168.1.1',
    interface: 'eth0',
    metric: 100,
  })
  client.interfaces[0].up = false
  expect(routingRows(client)).toEqual([])
})
