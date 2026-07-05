import { useNetworkStore } from '../../store/useNetworkStore'
import { RoutingTableView } from '../simulation/RoutingTableView'

const TYPE_LABEL = { client: 'Client', router: 'Router', server: 'Server' } as const

export function PropertyPanel() {
  const nodes = useNetworkStore((s) => s.nodes)
  const links = useNetworkStore((s) => s.links)
  const selectedNodeIds = useNetworkStore((s) => s.selectedNodeIds)
  const selectedLinkIds = useNetworkStore((s) => s.selectedLinkIds)

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
          </div>
          {node.type === 'router' && <RoutingTableView routerId={node.id} />}
        </>
      )}
      {link && (
        <div>
          <p className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Link</p>
          <p className="mt-1 font-mono text-sm text-neutral-100">
            {label(link.sourceId)} ↔ {label(link.targetId)}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 font-mono text-xs text-neutral-400">
            <dt>cost</dt>
            <dd className="text-right text-neutral-200">{link.cost}</dd>
            <dt>delay</dt>
            <dd className="text-right text-neutral-200">{link.delayMs} ms</dd>
            <dt>loss</dt>
            <dd className="text-right text-neutral-200">{(link.lossRate * 100).toFixed(0)}%</dd>
          </dl>
          {/* editing controls arrive in step 7 */}
        </div>
      )}
    </div>
  )
}
