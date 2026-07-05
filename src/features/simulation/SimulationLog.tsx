import { useEffect, useRef } from 'react'
import { useSimulationStore } from '../../store/useSimulationStore'

const LEVEL_CLS = {
  info: 'text-neutral-300',
  warn: 'text-amber-400',
  error: 'text-red-400',
} as const

export function SimulationLog() {
  const logs = useSimulationStore((s) => s.logs)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [logs.length])

  return (
    <div className="flex h-full flex-col">
      <p className="mb-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
        Simulation Log
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto font-mono text-xs leading-relaxed">
        {logs.length === 0 && (
          <p className="text-neutral-600">No events yet — build a topology and send a packet.</p>
        )}
        {logs.map((l, i) => (
          <p key={i} className={LEVEL_CLS[l.level]}>
            <span className="text-neutral-600">{(l.tick / 1000).toFixed(2).padStart(7)}s</span>{' '}
            {l.message}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
