import { expect, it } from 'vitest'
import { Simulation } from '../../src/core/simulation/Simulation'
import type { NetworkDocument } from '../../src/core/contracts'

it('drains 100,000 scheduled events within a bounded reference budget', () => {
  const document: NetworkDocument = {
    schemaVersion: 1,
    name: 'Scheduler benchmark',
    seed: 42,
    devices: [],
    links: [],
  }
  const sim = new Simulation(document)
  let executed = 0
  const start = performance.now()
  for (let i = 0; i < 100_000; i++)
    sim.schedule((i * 7919) % 1_000_000, () => {
      executed++
    })
  sim.advanceTo(1_000_001, 100_001)
  const elapsed = performance.now() - start
  expect(executed).toBe(100_000)
  expect(elapsed).toBeLessThan(10_000)
  console.info(
    `Scheduler: 100000 events in ${elapsed.toFixed(1)} ms; ${process.version} ${process.platform}/${process.arch}`,
  )
}, 15_000)
