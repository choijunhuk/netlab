import type { NetLink, NetNode } from '../types/network'

export interface GraphEdge {
  to: string
  link: NetLink
}

/** node id → outgoing edges. Undirected links appear once per direction. */
export type AdjacencyList = Map<string, GraphEdge[]>

/**
 * Failure handling happens entirely here (§6.1): down nodes and down links
 * are simply absent from the graph, so every algorithm downstream is
 * failure-oblivious.
 */
export function buildGraph(nodes: NetNode[], links: NetLink[]): AdjacencyList {
  const graph: AdjacencyList = new Map()
  for (const n of nodes) {
    if (!n.isDown) graph.set(n.id, [])
  }
  for (const l of links) {
    if (l.isDown) continue
    const a = graph.get(l.sourceId)
    const b = graph.get(l.targetId)
    if (!a || !b) continue // an endpoint is down or gone — link unusable
    a.push({ to: l.targetId, link: l })
    b.push({ to: l.sourceId, link: l })
  }
  return graph
}
