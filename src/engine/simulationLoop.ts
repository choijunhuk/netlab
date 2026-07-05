// ★ React-free zone (§8). Talks to the app exclusively through zustand stores.
import { nanoid } from 'nanoid'
import { shortestRoute } from '../algorithms/dijkstra'
import { linkBetween } from '../algorithms/graph'
import { useNetworkStore } from '../store/useNetworkStore'
import { useSimulationStore } from '../store/useSimulationStore'
import type { LogEntry, Packet } from '../types/simulation'
import { MAX_FRAME_DELTA_MS } from '../constants'

function label(nodeId: string): string {
  return useNetworkStore.getState().nodes.find((n) => n.id === nodeId)?.label ?? nodeId
}

/** Send one UDP data packet along the current shortest path. TCP arrives in step 8. */
export function sendUdpPacket(): void {
  const sim = useSimulationStore.getState()
  const { nodes, links } = useNetworkStore.getState()
  const { transferSourceId: src, transferDestId: dst } = sim
  if (!src || !dst || src === dst) return

  const path = shortestRoute(nodes, links, src, dst)
  if (!path || path.length < 2) {
    sim.addLog('error', `[UDP] ${label(src)} → ${label(dst)}: no route`)
    return
  }
  const packet: Packet = {
    id: nanoid(8),
    seq: 0,
    kind: 'data',
    protocol: 'udp',
    sourceId: src,
    destId: dst,
    path,
    hopIndex: 0,
    progress: 0,
    status: 'in-transit',
    retryCount: 0,
  }
  useSimulationStore.setState((s) => ({
    packets: [...s.packets, packet],
    isRunning: true,
    logs: [
      ...s.logs,
      {
        tick: s.tick,
        level: 'info' as const,
        message: `[UDP] ${label(src)} → ${label(dst)} sent via ${path.map(label).join(' → ')}`,
      },
    ],
  }))
  startLoop()
}

/** Advance every active packet by deltaMs. Exported for unit tests. */
export function stepSimulation(deltaMs: number): void {
  const sim = useSimulationStore.getState()
  const { nodes, links } = useNetworkStore.getState()
  const tick = sim.tick + deltaMs
  const newLogs: LogEntry[] = []
  const log = (level: LogEntry['level'], message: string) =>
    newLogs.push({ tick, level, message })

  const survivors: Packet[] = []
  for (const p of sim.packets) {
    const from = p.path[p.hopIndex]
    const to = p.path[p.hopIndex + 1]
    const link = linkBetween(links, from, to)
    const toNodeDown = nodes.find((n) => n.id === to)?.isDown ?? true
    if (!link || toNodeDown) {
      // topology changed under the packet's feet — it dies where it stands (§6.6)
      log('warn', `[${p.protocol.toUpperCase()}] packet dropped: ${label(from)} → ${label(to)} is down`)
      continue
    }

    const progress = p.progress + deltaMs / link.delayMs
    if (progress < 1) {
      survivors.push({ ...p, progress })
      continue
    }
    // hop complete
    const hopIndex = p.hopIndex + 1
    if (hopIndex >= p.path.length - 1) {
      log('info', `[${p.protocol.toUpperCase()}] delivered to ${label(p.destId)}`)
      continue
    }
    survivors.push({ ...p, hopIndex, progress: 0 })
  }

  useSimulationStore.setState((s) => ({
    tick,
    packets: survivors,
    isRunning: survivors.length > 0,
    logs: newLogs.length ? [...s.logs, ...newLogs] : s.logs,
  }))
  if (survivors.length === 0) stopLoop()
}

let rafId: number | null = null
let lastFrame = 0

export function startLoop(): void {
  // Node/test environment has no rAF — callers drive stepSimulation manually
  if (typeof requestAnimationFrame === 'undefined') return
  if (rafId !== null) return
  lastFrame = performance.now()
  const frame = (now: number) => {
    // clamp: a backgrounded tab must not teleport packets on return
    const delta = Math.min(now - lastFrame, MAX_FRAME_DELTA_MS)
    lastFrame = now
    stepSimulation(delta)
    if (rafId !== null) rafId = requestAnimationFrame(frame)
  }
  rafId = requestAnimationFrame(frame)
}

export function stopLoop(): void {
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = null
}
