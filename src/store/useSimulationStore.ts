import { create } from 'zustand'

// Grows in step 5+ (tick, packets, logs). For now: transfer endpoint selection.
interface SimulationState {
  transferSourceId: string | null
  transferDestId: string | null
  setTransferSource: (id: string | null) => void
  setTransferDest: (id: string | null) => void
}

export const useSimulationStore = create<SimulationState>((set) => ({
  transferSourceId: null,
  transferDestId: null,
  setTransferSource: (id) => set({ transferSourceId: id }),
  setTransferDest: (id) => set({ transferDestId: id }),
}))
