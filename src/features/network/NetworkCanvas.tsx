import { useCallback, useMemo } from 'react'
import {
  Background,
  ReactFlow,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { pathToLinkIds, shortestRoute } from '../../algorithms/dijkstra'
import { useNetworkStore } from '../../store/useNetworkStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import { PacketOverlay } from '../simulation/PacketOverlay'
import { NetNodeView, type NetFlowNode } from './nodes/NetNodeView'

const nodeTypes = { net: NetNodeView }

export function NetworkCanvas() {
  const nodes = useNetworkStore((s) => s.nodes)
  const links = useNetworkStore((s) => s.links)
  const linkMode = useNetworkStore((s) => s.linkMode)
  const pendingLinkSource = useNetworkStore((s) => s.pendingLinkSource)
  const selectedNodeIds = useNetworkStore((s) => s.selectedNodeIds)
  const selectedLinkIds = useNetworkStore((s) => s.selectedLinkIds)
  const transferSourceId = useSimulationStore((s) => s.transferSourceId)
  const transferDestId = useSimulationStore((s) => s.transferDestId)

  // derived, never stored (§10) — recomputes on any topology change
  const pathLinkIds = useMemo(() => {
    if (!transferSourceId || !transferDestId) return new Set<string>()
    const path = shortestRoute(nodes, links, transferSourceId, transferDestId)
    return new Set(path ? pathToLinkIds(path, links) : [])
  }, [nodes, links, transferSourceId, transferDestId])

  const rfNodes = useMemo<NetFlowNode[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'net',
        position: n.position,
        data: { node: n, isPendingLink: n.id === pendingLinkSource },
        selected: selectedNodeIds.includes(n.id),
      })),
    [nodes, pendingLinkSource, selectedNodeIds],
  )

  const rfEdges = useMemo<Edge[]>(
    () =>
      links.map((l) => {
        const onPath = pathLinkIds.has(l.id)
        return {
          id: l.id,
          source: l.sourceId,
          target: l.targetId,
          type: 'straight',
          selected: selectedLinkIds.includes(l.id),
          animated: onPath,
          style: l.isDown
            ? { stroke: 'var(--color-red-900)', strokeWidth: 2, strokeDasharray: '4 4' }
            : onPath
              ? { stroke: 'var(--color-amber-400)', strokeWidth: 2.5 }
              : { stroke: 'var(--color-neutral-600)', strokeWidth: 2 },
        }
      }),
    [links, selectedLinkIds, pathLinkIds],
  )

  const onNodesChange = useCallback((changes: NodeChange<NetFlowNode>[]) => {
    const s = useNetworkStore.getState()
    for (const c of changes) {
      if (c.type === 'position' && c.position) s.moveNode(c.id, c.position)
      else if (c.type === 'remove') s.removeNodes([c.id])
      else if (c.type === 'select') s.setNodeSelected(c.id, c.selected)
    }
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const s = useNetworkStore.getState()
    for (const c of changes) {
      if (c.type === 'remove') s.removeLinks([c.id])
      else if (c.type === 'select') s.setLinkSelected(c.id, c.selected)
    }
  }, [])

  const onNodeClick = useCallback<NodeMouseHandler<NetFlowNode>>(
    (_e, node) => {
      if (linkMode) useNetworkStore.getState().clickNodeForLink(node.id)
    },
    [linkMode],
  )

  return (
    <ReactFlow
      className={linkMode ? 'cursor-crosshair' : ''}
      colorMode="dark"
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      nodesConnectable={false}
      deleteKeyCode={['Backspace', 'Delete']}
    >
      <Background gap={24} />
      <PacketOverlay />
    </ReactFlow>
  )
}
