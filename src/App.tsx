import { NetworkCanvas } from './features/network/NetworkCanvas'
import { PropertyPanel } from './features/network/PropertyPanel'
import { useNetworkStore } from './store/useNetworkStore'
import { DEMO_SCENARIO, applyScenario } from './utils/scenario'
import { ToolPanel } from './features/network/ToolPanel'
import { SimulationLog } from './features/simulation/SimulationLog'
import { TransferControls } from './features/simulation/TransferControls'

function App() {
  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">
      {/* Top toolbar */}
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-neutral-800 bg-neutral-900 px-4">
        <span className="font-mono text-sm font-bold tracking-wider text-neutral-100">NetLab</span>
        <TransferControls />
        {/* TCP/UDP toggle + send button arrive in steps 5/8 */}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left tool panel */}
        <aside className="w-44 shrink-0 border-r border-neutral-800 bg-neutral-900 p-3">
          <ToolPanel />
        </aside>

        {/* Main canvas */}
        <main className="relative min-w-0 flex-1">
          <NetworkCanvas />
          <EmptyCanvasHint />
        </main>

        {/* Right property panel */}
        <aside className="w-64 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-900 p-3">
          <PropertyPanel />
        </aside>
      </div>

      {/* Bottom log panel */}
      <footer className="h-36 shrink-0 border-t border-neutral-800 bg-neutral-900 p-3">
        <SimulationLog />
      </footer>
    </div>
  )
}

function EmptyCanvasHint() {
  const empty = useNetworkStore((s) => s.nodes.length === 0)
  if (!empty) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-neutral-500">
        Add nodes from the left panel, connect them in link mode, then send a packet.
      </p>
      <button
        type="button"
        onClick={() => applyScenario(DEMO_SCENARIO)}
        className="pointer-events-auto rounded border border-neutral-600 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-400 hover:bg-neutral-800"
      >
        Load demo topology
      </button>
    </div>
  )
}

export default App
