import { useRef } from 'react'
import type { NodeType } from '../../types/network'
import { setRngSeed } from '../../engine/simulationLoop'
import { useNetworkStore } from '../../store/useNetworkStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import { DEMO_SCENARIO, applyScenario, exportToFile, importFromFile } from '../../utils/scenario'

const NODE_BUTTONS: { type: NodeType; label: string; dot: string }[] = [
  { type: 'client', label: 'Client', dot: 'bg-sky-500' },
  { type: 'router', label: 'Router', dot: 'bg-neutral-400' },
  { type: 'server', label: 'Server', dot: 'bg-emerald-500' },
]

export function ToolPanel() {
  const addNode = useNetworkStore((s) => s.addNode)
  const linkMode = useNetworkStore((s) => s.linkMode)
  const toggleLinkMode = useNetworkStore((s) => s.toggleLinkMode)
  const pending = useNetworkStore((s) => s.pendingLinkSource)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Nodes</p>
      {NODE_BUTTONS.map(({ type, label, dot }) => (
        <button
          key={type}
          type="button"
          onClick={() => addNode(type)}
          className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-1.5 text-left text-sm
            hover:border-neutral-500 hover:bg-neutral-800"
        >
          <span className={`h-2 w-2 rounded-full ${dot}`} />+ {label}
        </button>
      ))}

      <p className="mt-4 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Links</p>
      <button
        type="button"
        onClick={toggleLinkMode}
        className={`rounded border px-3 py-1.5 text-left text-sm ${
          linkMode
            ? 'border-amber-500 bg-amber-500/10 text-amber-400'
            : 'border-neutral-700 hover:border-neutral-500 hover:bg-neutral-800'
        }`}
      >
        {linkMode ? '⊘ Exit link mode' : '⌁ Link mode'}
      </button>
      {linkMode && (
        <p className="text-xs leading-relaxed text-neutral-500">
          {pending ? 'Now click the target node' : 'Click two nodes to connect them'}
        </p>
      )}
      <p className="mt-2 text-xs text-neutral-600">Delete/⌫ removes selection</p>

      <p className="mt-4 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
        Loss seed
      </p>
      <SeedInput />

      <p className="mt-4 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
        Scenario
      </p>
      <ScenarioControls />
    </div>
  )
}

const SCENARIO_BTN =
  'rounded border border-neutral-700 px-3 py-1.5 text-left text-sm hover:border-neutral-500 hover:bg-neutral-800'

function ScenarioControls() {
  const fileRef = useRef<HTMLInputElement>(null)
  const addLog = useSimulationStore((s) => s.addLog)
  const replaceAll = useNetworkStore((s) => s.replaceAll)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={SCENARIO_BTN}
        title="§12 demo: direct route + detour via Router 3"
        onClick={() => applyScenario(DEMO_SCENARIO)}
      >
        Load demo topology
      </button>
      <button type="button" className={SCENARIO_BTN} onClick={exportToFile}>
        Export JSON
      </button>
      <button type="button" className={SCENARIO_BTN} onClick={() => fileRef.current?.click()}>
        Import JSON
      </button>
      <button
        type="button"
        className={SCENARIO_BTN}
        onClick={() => replaceAll([], [], { client: 0, router: 0, server: 0 })}
      >
        Clear canvas
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const err = await importFromFile(file)
          if (err) addLog('error', `Import failed: ${err}`)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function SeedInput() {
  const seed = useSimulationStore((s) => s.rngSeed)
  return (
    <input
      type="number"
      title="Same seed reproduces the same packet-loss pattern"
      className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-200"
      value={seed}
      onChange={(e) => {
        const v = Number(e.target.value)
        if (!Number.isNaN(v)) setRngSeed(v)
      }}
    />
  )
}
