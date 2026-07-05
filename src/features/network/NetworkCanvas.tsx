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
import { useNetworkStore } from '../../store/useNetworkStore'
import { NetNodeView, type NetFlowNode } from './nodes/NetNodeView'

const nodeTypes = { net: NetNodeView }

export function NetworkCanvas() {
  const nodes = useNetworkStore((s) => s.nodes)
  const links = useNetworkStore((s) => s.links)
  const linkMode = useNetworkStore((s) => s.linkMode)
  const pendingLinkSource = useNetworkStore((s) => s.pendingLinkSource)
  const selectedNodeIds = useNetworkStore((s) => s.selectedNodeIds)
  const selectedLinkIds = useNetworkStore((s) => s.selectedLinkIds)

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
      links.map((l) => ({
        id: l.id,
        source: l.sourceId,
        target: l.targetId,
        type: 'straight',
        selected: selectedLinkIds.includes(l.id),
        style: { stroke: 'var(--color-neutral-600)', strokeWidth: 2 },
      })),
    [links, selectedLinkIds],
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
    </ReactFlow>
  )
}
