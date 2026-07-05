import { ViewportPortal, useReactFlow } from '@xyflow/react'
import { useSimulationStore } from '../../store/useSimulationStore'

/**
 * Packets rendered in flow coordinates via ViewportPortal, so they pan/zoom
 * with the canvas for free. Position = lerp between the centers of the two
 * nodes of the current hop — the simulation loop owns progress (§13: no CSS
 * transitions).
 */
export function PacketOverlay() {
  const packets = useSimulationStore((s) => s.packets)
  const { getInternalNode } = useReactFlow()

  const center = (nodeId: string) => {
    const n = getInternalNode(nodeId)
    if (!n) return null
    return {
      x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2,
      y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2,
    }
  }

  return (
    <ViewportPortal>
      {packets.map((p) => {
        const a = center(p.path[p.hopIndex])
        const b = center(p.path[p.hopIndex + 1])
        if (!a || !b) return null
        const x = a.x + (b.x - a.x) * p.progress
        const y = a.y + (b.y - a.y) * p.progress
        if (p.status === 'lost') {
          return (
            <div
              key={p.id}
              className="pointer-events-none absolute font-mono text-sm font-bold text-red-500"
              style={{
                transform: `translate(${x - 6}px, ${y - 10}px)`,
                opacity: Math.max(0, 1 - p.progress * 2),
              }}
            >
              ✕
            </div>
          )
        }
        return (
          <div
            key={p.id}
            className={`pointer-events-none absolute h-3 w-3 ${
              p.kind === 'ack'
                ? 'rounded-sm bg-emerald-400 shadow-[0_0_6px_var(--color-emerald-400)]'
                : 'rounded-full bg-orange-400 shadow-[0_0_6px_var(--color-orange-400)]'
            }`}
            style={{ transform: `translate(${x - 6}px, ${y - 6}px)` }}
          />
        )
      })}
    </ViewportPortal>
  )
}
