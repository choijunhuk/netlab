import { NetworkCanvas } from './features/network/NetworkCanvas'
import { PropertyPanel } from './features/network/PropertyPanel'
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

export default App
