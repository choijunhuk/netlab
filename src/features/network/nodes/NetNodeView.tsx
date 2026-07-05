import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { NetNode } from '../../../types/network'

export type NetFlowNode = Node<{ node: NetNode; isPendingLink: boolean }, 'net'>

const TYPE_STYLE = {
  client: { chip: 'bg-sky-500/20 text-sky-400', border: 'border-sky-600', letter: 'C' },
  router: { chip: 'bg-neutral-500/20 text-neutral-300', border: 'border-neutral-500', letter: 'R' },
  server: { chip: 'bg-emerald-500/20 text-emerald-400', border: 'border-emerald-600', letter: 'S' },
} as const

// ponytail: one parameterized component instead of Client/Router/ServerNode files —
// the three differ only by color + letter
export function NetNodeView({ data, selected }: NodeProps<NetFlowNode>) {
  const { node, isPendingLink } = data
  const s = TYPE_STYLE[node.type]
  const down = node.isDown

  return (
    <div
      className={`flex items-center gap-2 rounded border-2 bg-neutral-900 px-3 py-2
        ${down ? 'border-red-600 opacity-60' : s.border}
        ${selected ? 'ring-2 ring-white/60' : ''}
        ${isPendingLink ? 'ring-2 ring-amber-400' : ''}`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-bold
          ${down ? 'bg-red-500/20 text-red-400' : s.chip}`}
      >
        {s.letter}
      </span>
      <span className="text-xs font-medium text-neutral-200">{node.label}</span>
      {/* hidden center handles — straight edges anchor to node center */}
      <Handle type="source" position={Position.Top} style={HIDDEN_HANDLE} />
      <Handle type="target" position={Position.Top} style={HIDDEN_HANDLE} />
    </div>
  )
}

const HIDDEN_HANDLE: React.CSSProperties = {
  opacity: 0,
  pointerEvents: 'none',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 'none',
}
