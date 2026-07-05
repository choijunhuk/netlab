import { useNetworkStore } from '../store/useNetworkStore'
import type { NetLink, NetNode, NodeType } from '../types/network'

const STORAGE_KEY = 'netlab:scenario'

export interface Scenario {
  nodes: NetNode[]
  links: NetLink[]
  counters: Record<NodeType, number>
}

export function currentScenario(): Scenario {
  const { nodes, links, counters } = useNetworkStore.getState()
  return { nodes, links, counters }
}

export function applyScenario(s: Scenario): void {
  useNetworkStore.getState().replaceAll(s.nodes, s.links, s.counters)
}

/* eslint-disable @typescript-eslint/no-explicit-any -- validating untrusted JSON */
export function isScenario(x: unknown): x is Scenario {
  const s = x as any
  return (
    !!s &&
    Array.isArray(s.nodes) &&
    Array.isArray(s.links) &&
    s.nodes.every(
      (n: any) =>
        n &&
        typeof n.id === 'string' &&
        ['client', 'router', 'server'].includes(n.type) &&
        typeof n.label === 'string' &&
        typeof n.position?.x === 'number' &&
        typeof n.position?.y === 'number' &&
        typeof n.isDown === 'boolean',
    ) &&
    s.links.every(
      (l: any) =>
        l &&
        typeof l.id === 'string' &&
        typeof l.sourceId === 'string' &&
        typeof l.targetId === 'string' &&
        typeof l.cost === 'number' &&
        typeof l.delayMs === 'number' &&
        typeof l.lossRate === 'number' &&
        typeof l.isDown === 'boolean',
    ) &&
    !!s.counters &&
    typeof s.counters.client === 'number' &&
    typeof s.counters.router === 'number' &&
    typeof s.counters.server === 'number'
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Restore last session and auto-save on every topology change. Browser only. */
export function initPersistence(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isScenario(parsed)) applyScenario(parsed)
    }
  } catch {
    // corrupt save — start empty
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  useNetworkStore.subscribe(() => {
    clearTimeout(timer)
    timer = setTimeout(
      () => localStorage.setItem(STORAGE_KEY, JSON.stringify(currentScenario())),
      500,
    )
  })
}

export function exportToFile(): void {
  const blob = new Blob([JSON.stringify(currentScenario(), null, 2)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'netlab-scenario.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Returns an error message, or null on success. */
export async function importFromFile(file: File): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await file.text())
    if (!isScenario(parsed)) return 'Not a valid NetLab scenario file'
    applyScenario(parsed)
    return null
  } catch {
    return 'File is not valid JSON'
  }
}

const demoLink = (
  id: string,
  sourceId: string,
  targetId: string,
  cost: number,
): NetLink => ({ id, sourceId, targetId, cost, delayMs: 300, lossRate: 0, isDown: false })

/** §12 demo: Client A — R1 — R2 — Server direct, R1 — R3 — R2 detour. */
export const DEMO_SCENARIO: Scenario = {
  nodes: [
    { id: 'client-a', type: 'client', label: 'Client A', position: { x: 60, y: 160 }, isDown: false },
    { id: 'r1', type: 'router', label: 'Router 1', position: { x: 240, y: 160 }, isDown: false },
    { id: 'r2', type: 'router', label: 'Router 2', position: { x: 460, y: 160 }, isDown: false },
    { id: 'r3', type: 'router', label: 'Router 3', position: { x: 350, y: 320 }, isDown: false },
    { id: 'srv', type: 'server', label: 'Server 1', position: { x: 640, y: 160 }, isDown: false },
  ],
  links: [
    demoLink('l-a-r1', 'client-a', 'r1', 1),
    demoLink('l-r1-r2', 'r1', 'r2', 1),
    demoLink('l-r1-r3', 'r1', 'r3', 2),
    demoLink('l-r3-r2', 'r3', 'r2', 2),
    demoLink('l-r2-srv', 'r2', 'srv', 1),
  ],
  counters: { client: 1, router: 3, server: 1 },
}
