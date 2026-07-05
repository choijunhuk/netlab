import type { NetLink, NetNode } from '../types/network'
import { dijkstra, reconstructPath } from './dijkstra'
import { buildGraph } from './graph'

/** destination node id → next hop + total cost, or null when unreachable. */
export type RoutingTable = Map<string, { nextHopId: string; totalCost: number } | null>

export function computeRoutingTable(
  nodes: NetNode[],
  links: NetLink[],
  routerId: string,
): RoutingTable {
  const { dist, prev } = dijkstra(buildGraph(nodes, links), routerId)
  const table: RoutingTable = new Map()
  for (const n of nodes) {
    if (n.id === routerId) continue
    const path = reconstructPath(prev, routerId, n.id)
    table.set(
      n.id,
      path && path.length > 1 ? { nextHopId: path[1], totalCost: dist.get(n.id)! } : null,
    )
  }
  return table
}
