import type { NetLink, NetNode } from '../types/network'
import { buildGraph, linkBetween, type AdjacencyList } from './graph'

export interface ShortestPathResult {
  dist: Map<string, number>
  prev: Map<string, string | null>
}

/** Weight extractor — cost by default; §6.2 leaves the door open for delay-based weights. */
export type WeightFn = (link: NetLink) => number

export const costWeight: WeightFn = (link) => link.cost

// ponytail: linear-scan min search instead of a heap — O(V²) is instant for
// the ≤50 nodes this tool targets; swap in a priority queue if that changes
export function dijkstra(
  graph: AdjacencyList,
  sourceId: string,
  weight: WeightFn = costWeight,
): ShortestPathResult {
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()
  if (!graph.has(sourceId)) return { dist, prev }

  for (const id of graph.keys()) {
    dist.set(id, Infinity)
    prev.set(id, null)
  }
  dist.set(sourceId, 0)

  const visited = new Set<string>()
  for (;;) {
    let u: string | null = null
    let best = Infinity
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d
        u = id
      }
    }
    if (u === null) break // rest unreachable
    visited.add(u)
    for (const { to, link } of graph.get(u) ?? []) {
      if (visited.has(to)) continue
      const alt = best + weight(link)
      if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt)
        prev.set(to, u)
      }
    }
  }
  return { dist, prev }
}

/** Convenience: topology in, node-id path out (null = unreachable). */
export function shortestRoute(
  nodes: NetNode[],
  links: NetLink[],
  sourceId: string,
  destId: string,
  weight: WeightFn = costWeight,
): string[] | null {
  const { prev } = dijkstra(buildGraph(nodes, links), sourceId, weight)
  return reconstructPath(prev, sourceId, destId)
}

/** Link ids crossed by a node-id path, for highlighting. */
export function pathToLinkIds(path: string[], links: NetLink[]): string[] {
  const ids: string[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const l = linkBetween(links, path[i], path[i + 1])
    if (l) ids.push(l.id)
  }
  return ids
}

/** Path source→dest as node ids, or null when unreachable. */
export function reconstructPath(
  prev: Map<string, string | null>,
  sourceId: string,
  destId: string,
): string[] | null {
  if (sourceId === destId) return prev.has(sourceId) ? [sourceId] : null
  const path: string[] = []
  let cur: string | null = destId
  while (cur !== null) {
    path.push(cur)
    if (cur === sourceId) return path.reverse()
    cur = prev.get(cur) ?? null
  }
  return null
}
