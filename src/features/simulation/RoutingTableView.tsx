import { useMemo } from 'react'
import { computeRoutingTable } from '../../algorithms/routingTable'
import { useNetworkStore } from '../../store/useNetworkStore'

export function RoutingTableView({ routerId }: { routerId: string }) {
  const nodes = useNetworkStore((s) => s.nodes)
  const links = useNetworkStore((s) => s.links)

  // derived on every topology change — never stored (§5)
  const rows = useMemo(() => {
    const table = computeRoutingTable(nodes, links, routerId)
    const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id
    return [...table.entries()].map(([destId, entry]) => ({
      dest: label(destId),
      nextHop: entry ? label(entry.nextHopId) : null,
      cost: entry?.totalCost ?? null,
    }))
  }, [nodes, links, routerId])

  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
        Routing table
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-neutral-600">No other nodes.</p>
      ) : (
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1 font-normal">dest</th>
              <th className="py-1 font-normal">next hop</th>
              <th className="py-1 text-right font-normal">cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dest} className="border-t border-neutral-800">
                <td className="py-1 text-neutral-300">{r.dest}</td>
                {r.nextHop ? (
                  <>
                    <td className="py-1 text-neutral-300">{r.nextHop}</td>
                    <td className="py-1 text-right text-neutral-300">{r.cost}</td>
                  </>
                ) : (
                  <td colSpan={2} className="py-1 text-red-400">
                    unreachable
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
