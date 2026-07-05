import { describe, expect, it } from 'vitest'
import type { NetLink, NetNode } from '../types/network'
import { computeRoutingTable } from './routingTable'

let seq = 0
const node = (id: string, isDown = false): NetNode => ({
  id,
  type: 'router',
  label: id,
  position: { x: 0, y: 0 },
  isDown,
})
const link = (a: string, b: string, cost = 1, isDown = false): NetLink => ({
  id: `l${seq++}`,
  sourceId: a,
  targetId: b,
  cost,
  delayMs: 100,
  lossRate: 0,
  isDown,
})

// §12 demo shape: client - r1 - r2 - server, detour r1 - r3 - r2
const nodes = [node('client'), node('r1'), node('r2'), node('r3'), node('server')]
const baseLinks = () => [
  link('client', 'r1'),
  link('r1', 'r2', 1),
  link('r1', 'r3', 2),
  link('r3', 'r2', 2),
  link('r2', 'server'),
]

describe('computeRoutingTable', () => {
  it('picks the direct next hop when cheapest', () => {
    const table = computeRoutingTable(nodes, baseLinks(), 'r1')
    expect(table.get('server')).toEqual({ nextHopId: 'r2', totalCost: 2 })
    expect(table.get('client')).toEqual({ nextHopId: 'client', totalCost: 1 })
    expect(table.has('r1')).toBe(false) // no entry for self
  })

  it('switches next hop to the detour when the direct link dies', () => {
    const links = baseLinks().map((l) =>
      l.sourceId === 'r1' && l.targetId === 'r2' ? { ...l, isDown: true } : l,
    )
    const table = computeRoutingTable(nodes, links, 'r1')
    expect(table.get('server')).toEqual({ nextHopId: 'r3', totalCost: 5 })
  })

  it('marks unreachable destinations null', () => {
    const table = computeRoutingTable([...nodes, node('island')], baseLinks(), 'r1')
    expect(table.get('island')).toBeNull()
  })
})
