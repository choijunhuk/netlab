import { useMemo } from 'react'
import { dijkstra } from '../../algorithms/dijkstra'
import { buildGraph } from '../../algorithms/graph'
import { reconstructPath } from '../../algorithms/dijkstra'
import { useNetworkStore } from '../../store/useNetworkStore'
import { useSimulationStore } from '../../store/useSimulationStore'

const SELECT_CLS =
  'rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200'

function NodeSelect({
  value,
  onChange,
  placeholder,
}: {
  value: string | null
  onChange: (id: string | null) => void
  placeholder: string
}) {
  const nodes = useNetworkStore((s) => s.nodes)
  return (
    <select
      className={SELECT_CLS}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{placeholder}</option>
      {nodes.map((n) => (
        <option key={n.id} value={n.id}>
          {n.label}
        </option>
      ))}
    </select>
  )
}

export function TransferControls() {
  const nodes = useNetworkStore((s) => s.nodes)
  const links = useNetworkStore((s) => s.links)
  const sourceId = useSimulationStore((s) => s.transferSourceId)
  const destId = useSimulationStore((s) => s.transferDestId)
  const setSource = useSimulationStore((s) => s.setTransferSource)
  const setDest = useSimulationStore((s) => s.setTransferDest)

  const summary = useMemo(() => {
    const valid = (id: string | null) => id !== null && nodes.some((n) => n.id === id)
    if (!valid(sourceId) || !valid(destId) || sourceId === destId) return null
    const { dist, prev } = dijkstra(buildGraph(nodes, links), sourceId!)
    const path = reconstructPath(prev, sourceId!, destId!)
    if (!path) return { text: 'unreachable', ok: false }
    return { text: `cost ${dist.get(destId!)} · ${path.length - 1} hops`, ok: true }
  }, [nodes, links, sourceId, destId])

  return (
    <div className="flex items-center gap-2">
      <NodeSelect value={sourceId} onChange={setSource} placeholder="source…" />
      <span className="text-xs text-neutral-500">→</span>
      <NodeSelect value={destId} onChange={setDest} placeholder="dest…" />
      {summary && (
        <span
          className={`font-mono text-xs ${summary.ok ? 'text-amber-400' : 'text-red-400'}`}
        >
          {summary.text}
        </span>
      )}
    </div>
  )
}
