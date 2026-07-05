import type { NodeType } from '../../types/network'
import { useNetworkStore } from '../../store/useNetworkStore'

const NODE_BUTTONS: { type: NodeType; label: string; dot: string }[] = [
  { type: 'client', label: 'Client', dot: 'bg-sky-500' },
  { type: 'router', label: 'Router', dot: 'bg-neutral-400' },
  { type: 'server', label: 'Server', dot: 'bg-emerald-500' },
]

export function ToolPanel() {
  const addNode = useNetworkStore((s) => s.addNode)
  const linkMode = useNetworkStore((s) => s.linkMode)
  const toggleLinkMode = useNetworkStore((s) => s.toggleLinkMode)
  const pending = useNetworkStore((s) => s.pendingLinkSource)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Nodes</p>
      {NODE_BUTTONS.map(({ type, label, dot }) => (
        <button
          key={type}
          type="button"
          onClick={() => addNode(type)}
          className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-1.5 text-left text-sm
            hover:border-neutral-500 hover:bg-neutral-800"
        >
          <span className={`h-2 w-2 rounded-full ${dot}`} />+ {label}
        </button>
      ))}

      <p className="mt-4 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Links</p>
      <button
        type="button"
        onClick={toggleLinkMode}
        className={`rounded border px-3 py-1.5 text-left text-sm ${
          linkMode
            ? 'border-amber-500 bg-amber-500/10 text-amber-400'
            : 'border-neutral-700 hover:border-neutral-500 hover:bg-neutral-800'
        }`}
      >
        {linkMode ? '⊘ Exit link mode' : '⌁ Link mode'}
      </button>
      {linkMode && (
        <p className="text-xs leading-relaxed text-neutral-500">
          {pending ? 'Now click the target node' : 'Click two nodes to connect them'}
        </p>
      )}
      <p className="mt-2 text-xs text-neutral-600">Delete/⌫ removes selection</p>
    </div>
  )
}
