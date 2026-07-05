import { useNetworkStore } from '../../store/useNetworkStore'
import { RoutingTableView } from '../simulation/RoutingTableView'

const TYPE_LABEL = { client: 'Client', router: 'Router', server: 'Server' } as const

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-neutral-400">
      {label}
      <input
        type="number"
        className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right font-mono text-xs text-neutral-200"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isNaN(v)) return
          onChange(Math.max(min, max !== undefined ? Math.min(max, v) : v))
        }}
      />
    </label>
  )
}

function DownToggle({ isDown, onToggle }: { isDown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`mt-1 w-full rounded border px-3 py-1.5 text-xs font-semibold ${
        isDown
          ? 'border-red-600 bg-red-500/10 text-red-400'
          : 'border-neutral-700 text-neutral-400 hover:border-red-700 hover:text-red-400'
      }`}
    >
      {isDown ? '⚠ DOWN — click to restore' : 'Mark as down'}
    </button>
  )
}

export function PropertyPanel() {
  const nodes = useNetworkStore((s) => s.nodes)
  const links = useNetworkStore((s) => s.links)
  const selectedNodeIds = useNetworkStore((s) => s.selectedNodeIds)
  const selectedLinkIds = useNetworkStore((s) => s.selectedLinkIds)
  const updateNode = useNetworkStore((s) => s.updateNode)
  const updateLink = useNetworkStore((s) => s.updateLink)

  const node = nodes.find((n) => n.id === selectedNodeIds.at(-1))
  const link = node ? undefined : links.find((l) => l.id === selectedLinkIds.at(-1))
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id

  if (!node && !link) {
    return (
      <div>
        <p className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
          Properties
        </p>
        <p className="mt-2 text-xs text-neutral-600">Select a node or link.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      {node && (
        <>
          <div>
            <p className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
              {TYPE_LABEL[node.type]}
            </p>
            <p className="mt-1 font-mono text-sm text-neutral-100">{node.label}</p>
            <DownToggle
              isDown={node.isDown}
              onToggle={() => updateNode(node.id, { isDown: !node.isDown })}
            />
          </div>
          {node.type === 'router' && <RoutingTableView routerId={node.id} />}
        </>
      )}
      {link && (
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Link</p>
            <p className="mt-1 font-mono text-sm text-neutral-100">
              {label(link.sourceId)} ↔ {label(link.targetId)}
            </p>
          </div>
          <NumberField
            label="cost"
            value={link.cost}
            min={1}
            onChange={(v) => updateLink(link.id, { cost: v })}
          />
          <NumberField
            label="delay (ms)"
            value={link.delayMs}
            min={10}
            onChange={(v) => updateLink(link.id, { delayMs: v })}
          />
          <NumberField
            label="loss (%)"
            value={Math.round(link.lossRate * 100)}
            min={0}
            max={100}
            onChange={(v) => updateLink(link.id, { lossRate: v / 100 })}
          />
          <DownToggle
            isDown={link.isDown}
            onToggle={() => updateLink(link.id, { isDown: !link.isDown })}
          />
        </div>
      )}
    </div>
  )
}
