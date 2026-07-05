import { create } from 'zustand'
import { DEFAULT_RNG_SEED } from '../constants'
import type { LogEntry, Packet } from '../types/simulation'

interface SimulationState {
  tick: number // accumulated simulation time, ms
  isRunning: boolean
  packets: Packet[]
  logs: LogEntry[]
  rngSeed: number // display only — the RNG itself lives in engine/simulationLoop
  protocol: 'udp' | 'tcp'
  transferSourceId: string | null
  transferDestId: string | null

  setProtocol: (p: 'udp' | 'tcp') => void
  setTransferSource: (id: string | null) => void
  setTransferDest: (id: string | null) => void
  addLog: (level: LogEntry['level'], message: string) => void
  // packets/tick are advanced by the engine via setState (engine/simulationLoop.ts)
}

export const useSimulationStore = create<SimulationState>((set) => ({
  tick: 0,
  isRunning: false,
  packets: [],
  logs: [],
  rngSeed: DEFAULT_RNG_SEED,
  protocol: 'udp',
  setProtocol: (p) => set({ protocol: p }),
  transferSourceId: null,
  transferDestId: null,

  setTransferSource: (id) => set({ transferSourceId: id }),
  setTransferDest: (id) => set({ transferDestId: id }),
  addLog: (level, message) =>
    set((s) => ({ logs: [...s.logs, { tick: s.tick, level, message }] })),
}))
