import { describe, expect, it } from 'vitest'
import type { NetLink, NetNode } from '../types/network'
import { buildGraph } from './graph'
import { dijkstra, reconstructPath } from './dijkstra'

let seq = 0
const node = (id: string, isDown = false): NetNode => ({
  id,
  type: 'router',
  label: id,
  position: { x: 0, y: 0 },
  isDown,
})
const link = (sourceId: string, targetId: string, cost = 1, isDown = false): NetLink => ({
  id: `l${seq++}`,
  sourceId,
  targetId,
  cost,
  delayMs: 100,
  lossRate: 0,
  isDown,
})

const shortestPath = (nodes: NetNode[], links: NetLink[], from: string, to: string) => {
  const { prev } = dijkstra(buildGraph(nodes, links), from)
  return reconstructPath(prev, from, to)
}

describe('dijkstra + reconstructPath', () => {
  it('finds the direct path', () => {
    expect(shortestPath([node('a'), node('b')], [link('a', 'b')], 'a', 'b')).toEqual(['a', 'b'])
  })

  it('prefers cheaper multi-hop over expensive direct link', () => {
    // §12 demo shape: direct cost 5 vs detour 1+1
    const nodes = [node('a'), node('b'), node('c')]
    const links = [link('a', 'b', 5), link('a', 'c', 1), link('c', 'b', 1)]
    expect(shortestPath(nodes, links, 'a', 'b')).toEqual(['a', 'c', 'b'])
  })

  it('picks one valid path among equal-cost alternatives', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    const links = [link('a', 'b'), link('b', 'd'), link('a', 'c'), link('c', 'd')]
    const path = shortestPath(nodes, links, 'a', 'd')
    expect([
      ['a', 'b', 'd'],
      ['a', 'c', 'd'],
    ]).toContainEqual(path)
    const { dist } = dijkstra(buildGraph(nodes, links), 'a')
    expect(dist.get('d')).toBe(2)
  })

  it('returns null for unreachable destinations', () => {
    expect(shortestPath([node('a'), node('b')], [], 'a', 'b')).toBeNull()
  })

  it('excludes down links and reroutes', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const links = [link('a', 'b', 1, true), link('a', 'c', 2), link('c', 'b', 2)]
    expect(shortestPath(nodes, links, 'a', 'b')).toEqual(['a', 'c', 'b'])
  })

  it('excludes down nodes and their links', () => {
    const nodes = [node('a'), node('b'), node('c', true)]
    const links = [link('a', 'c'), link('c', 'b')]
    expect(shortestPath(nodes, links, 'a', 'b')).toBeNull()
  })

  it('links are traversable in both directions', () => {
    expect(shortestPath([node('a'), node('b')], [link('a', 'b')], 'b', 'a')).toEqual(['b', 'a'])
  })

  it('source equal to dest yields single-node path', () => {
    const { prev } = dijkstra(buildGraph([node('a')], []), 'a')
    expect(reconstructPath(prev, 'a', 'a')).toEqual(['a'])
  })

  it('handles a missing source gracefully', () => {
    expect(shortestPath([node('a')], [], 'ghost', 'a')).toBeNull()
  })
})
