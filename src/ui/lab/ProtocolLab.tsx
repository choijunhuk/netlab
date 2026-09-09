import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react'
import type { Connection, NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createSimulation } from '../../application/createSimulation'
import { examples, createDevice, duplicateDevice } from '../../examples'
import {
  exportDocument,
  importDocument,
  loadAutosave,
  saveAutosave,
  validateDocument,
} from '../../storage'
import type { DeviceKind, NetworkDocument, TraceRecord, Transmission } from '../../core/contracts'
import { Inspector } from './Inspector'
import { DeviceView, WireView } from './Topology'
import type { DeviceNode, WireEdge } from './Topology'
import './protocol-lab.css'

const nodeTypes = { device: DeviceView }
const edgeTypes = { wire: WireView }
const kinds: DeviceKind[] = ['pc', 'server', 'switch', 'router']
const initialExample = () => examples.find((e) => e.id === 'two-routers') ?? examples[0]
const initial = () => structuredClone(initialExample().document)

function Workspace() {
  const [document, setDocument] = useState<NetworkDocument>(initial)
  const [simulation, setSimulation] = useState(() => createSimulation(document))
  const [snapshot, setSnapshot] = useState(() => simulation.snapshot())
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState('')
  const [event, setEvent] = useState<TraceRecord>()
  const [source, setSource] = useState(
    document.devices.find((d) => d.kind === 'pc')?.id ?? document.devices[0]?.id ?? '',
  )
  const [command, setCommand] = useState(initialExample().command)
  const [protocol, setProtocol] = useState('All')
  const [deviceFilter, setDeviceFilter] = useState('All')
  const [dropsOnly, setDropsOnly] = useState(false)
  const [panel, setPanel] = useState<'equipment' | 'inspector' | 'console' | ''>('')
  const [history, setHistory] = useState<{ past: NetworkDocument[]; future: NetworkDocument[] }>({
    past: [],
    future: [],
  })
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const file = useRef<HTMLInputElement>(null)
  const latest = useRef(document)
  const flow = useReactFlow<DeviceNode, WireEdge>()
  latest.current = document
  const refresh = useCallback(() => setSnapshot(simulation.snapshot()), [simulation])
  const replace = useCallback((next: NetworkDocument, record = true) => {
    try {
      const valid = validateDocument(next)
      if (record) setHistory((h) => ({ past: [...h.past.slice(-49), latest.current], future: [] }))
      const engine = createSimulation(valid)
      setRunning(false)
      setDocument(valid)
      setSimulation(engine)
      setSnapshot(engine.snapshot())
      setPositions({})
      setEvent(undefined)
      setError('')
      setDirty(true)
      setSource((current) =>
        valid.devices.some((d) => d.id === current)
          ? current
          : (valid.devices.find((d) => d.kind === 'pc')?.id ?? valid.devices[0]?.id ?? ''),
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }, [])
  useEffect(() => {
    if (!running) return
    let request = 0,
      previous = performance.now(),
      painted = previous
    const tick = (now: number) => {
      const elapsed = Math.min(100, now - previous)
      previous = now
      try {
        simulation.advanceTo(simulation.nowUs + elapsed * 1000 * speed, 2000)
        if (now - painted >= 1000 / 30) {
          refresh()
          painted = now
        }
        request = requestAnimationFrame(tick)
      } catch (e) {
        setError(String(e))
        setRunning(false)
      }
    }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [running, simulation, speed, refresh])
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => {
      saveAutosave(document)
        .then(() => setNotice('Autosaved locally'))
        .catch((e: unknown) =>
          setError(`Autosave failed. Save JSON to keep your work. ${String(e)}`),
        )
    }, 700)
    return () => clearTimeout(timer)
  }, [document, dirty])
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])
  const undo = () => {
    const previous = history.past.at(-1)
    if (previous && replace(previous, false))
      setHistory((h) => ({ past: h.past.slice(0, -1), future: [document, ...h.future] }))
  }
  const redo = () => {
    const next = history.future[0]
    if (next && replace(next, false))
      setHistory((h) => ({ past: [...h.past, document], future: h.future.slice(1) }))
  }
  const remove = () => {
    if (selected) {
      replace({
        ...document,
        devices: document.devices.filter((d) => d.id !== selected),
        links: document.links.filter(
          (l) => l.id !== selected && l.a.deviceId !== selected && l.b.deviceId !== selected,
        ),
      })
      setSelected('')
    }
  }
  const duplicate = () => {
    const d = document.devices.find((d) => d.id === selected)
    if (d) {
      const copy = duplicateDevice(
        d,
        document.devices,
        document.links.map((l) => l.id),
      )
      if (replace({ ...document, devices: [...document.devices, copy] })) setSelected(copy.id)
    }
  }
  const add = (
    kind: DeviceKind,
    position = { x: 100 + document.devices.length * 30, y: 100 + document.devices.length * 25 },
  ) => {
    const d = createDevice(
      kind,
      document.devices,
      position,
      document.links.map((l) => l.id),
    )
    if (replace({ ...document, devices: [...document.devices, d] })) setSelected(d.id)
  }
  const protect = () =>
    !dirty ||
    window.confirm(
      '현재 프로젝트를 교체할까요? 별도 사본이 필요하면 먼저 Save JSON으로 저장하세요.',
    )
  const inspectPacket = (p: Transmission) => {
    setEvent({
      id: p.id,
      runId: 'current',
      timeUs: snapshot.nowUs,
      protocol: p.protocol,
      type: 'transmission',
      message: `${p.fromDeviceId} → ${p.toDeviceId}`,
      deviceId: p.fromDeviceId,
      linkId: p.linkId,
      frame: structuredClone(p.frame),
    })
    setSelected(p.fromDeviceId)
    setPanel('inspector')
  }
  const nodes: DeviceNode[] = document.devices.map((d) => ({
    id: d.id,
    type: 'device',
    position: positions[d.id] ?? d.position,
    selected: d.id === selected,
    data: {
      device: snapshot.devices.find((live) => live.id === d.id) ?? d,
      highlighted: event?.deviceId === d.id,
    },
  }))
  const edges: WireEdge[] = document.links.map((l) => ({
    id: l.id,
    type: 'wire',
    source: l.a.deviceId,
    target: l.b.deviceId,
    sourceHandle: l.a.interfaceId,
    targetHandle: l.b.interfaceId,
    selected: selected === l.id,
    data: {
      link: snapshot.links.find((live) => live.id === l.id) ?? l,
      packets: snapshot.transmissions.filter(
        (p) => p.linkId === l.id && p.startUs <= snapshot.nowUs && p.arrivalUs >= snapshot.nowUs,
      ),
      nowUs: snapshot.nowUs,
      inspect: inspectPacket,
    },
  }))
  const onChanges = (changes: NodeChange<DeviceNode>[]) => {
    const changed = applyNodeChanges(changes, nodes)
    setPositions(Object.fromEntries(changed.map((n) => [n.id, n.position])))
  }
  const connect = (c: Connection) => {
    if (!c.sourceHandle || !c.targetHandle) return
    const occupied = new Set([
      ...document.devices.flatMap((d) => [d.id, ...d.interfaces.map((p) => p.id)]),
      ...document.links.map((l) => l.id),
    ])
    let linkId = `link-${crypto.randomUUID()}`
    while (occupied.has(linkId)) linkId = `link-${crypto.randomUUID()}`
    replace({
      ...document,
      links: [
        ...document.links,
        {
          id: linkId,
          a: { deviceId: c.source, interfaceId: c.sourceHandle },
          b: { deviceId: c.target, interfaceId: c.targetHandle },
          latencyMs: 10,
          bandwidthMbps: 100,
          lossPercent: 0,
          queueCapacity: 64,
          up: true,
        },
      ],
    })
  }
  const visibleEvents = useMemo(
    () =>
      snapshot.trace
        .filter(
          (t) =>
            (protocol === 'All' || t.protocol === protocol) &&
            (deviceFilter === 'All' || t.deviceId === deviceFilter) &&
            (!dropsOnly || Boolean(t.reason) || /drop|fail|timeout/i.test(t.type)),
        )
        .slice(-500),
    [snapshot.trace, protocol, deviceFilter, dropsOnly],
  )
  const submitCommand = (text: string) => {
    if (!source || !text.trim()) return
    try {
      simulation.command(source, text)
      refresh()
      setCommand('')
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <div
      className="protocol-lab"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('input,textarea,select')) return
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault()
          if (e.shiftKey) redo()
          else undo()
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
          e.preventDefault()
          duplicate()
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          remove()
        }
      }}
    >
      <header className="lab-toolbar">
        <div className="lab-project">
          <strong>Protocol lab</strong>
          <span>
            {document.name}
            {dirty ? ' •' : ''}
          </span>
        </div>
        <label className="lab-inline">
          Example
          <select
            aria-label="Example topology"
            data-testid="example-picker"
            value=""
            onChange={(e) => {
              const example = examples.find((x) => x.id === e.target.value)
              if (example && protect() && replace(example.document)) {
                setSource(example.sourceDeviceId)
                setCommand(example.command)
                setNotice(example.description)
                requestAnimationFrame(() => flow.fitView({ padding: 0.25 }))
              }
            }}
          >
            <option value="">Choose topology…</option>
            {examples.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            if (protect())
              replace({
                schemaVersion: 1,
                name: 'Untitled network',
                seed: 1,
                devices: [],
                links: [],
              })
          }}
        >
          New
        </button>
        <button
          onClick={() => {
            try {
              const blob = new Blob([exportDocument(document)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = window.document.createElement('a')
              a.href = url
              a.download = `${document.name.replace(/[^a-z0-9-]/gi, '_')}.json`
              a.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
              setDirty(false)
              setNotice('JSON saved')
            } catch (e) {
              setError(String(e))
            }
          }}
        >
          Save JSON
        </button>
        <button onClick={() => file.current?.click()}>Load JSON</button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const selectedFile = e.target.files?.[0]
            e.target.value = ''
            if (!selectedFile) return
            try {
              const imported = importDocument(await selectedFile.text())
              if (protect()) replace(imported)
            } catch (error) {
              setError(`Import rejected; current project kept. ${String(error)}`)
            }
          }}
        />
        <button
          onClick={async () => {
            try {
              const saved = await loadAutosave()
              if (!saved) setNotice('No autosave found')
              else if (protect()) replace(saved)
            } catch (e) {
              setError(`Cannot restore autosave. ${String(e)}`)
            }
          }}
        >
          Restore autosave
        </button>
        <div className="lab-run-controls">
          <button
            aria-label={running ? 'Pause simulation' : 'Play simulation'}
            className="lab-primary"
            onClick={() => {
              if (running) refresh()
              setRunning(!running)
            }}
          >
            {running ? 'Ⅱ Pause' : '▶ Play'}
          </button>
          <button
            aria-label="Step simulation"
            onClick={() => {
              setRunning(false)
              simulation.step()
              refresh()
            }}
          >
            Step
          </button>
          <button
            aria-label="Reset simulation"
            onClick={() => {
              setRunning(false)
              simulation.reset()
              refresh()
              setEvent(undefined)
            }}
          >
            Reset
          </button>
          <label className="lab-inline">
            Speed
            <select
              aria-label="Simulation speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              {[0.1, 0.25, 0.5, 1, 2, 4, 5, 10].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <nav className="lab-mobile-tabs" aria-label="Workspace panels">
        {(['equipment', 'inspector', 'console'] as const).map((p) => (
          <button key={p} aria-pressed={panel === p} onClick={() => setPanel(panel === p ? '' : p)}>
            {p}
          </button>
        ))}
      </nav>
      {(error || notice) && (
        <div className={`lab-status ${error ? 'lab-error' : ''}`} role={error ? 'alert' : 'status'}>
          {error || notice}
          <button
            aria-label="Dismiss message"
            onClick={() => {
              setError('')
              setNotice('')
            }}
          >
            ×
          </button>
        </div>
      )}
      <main className="lab-workspace">
        <aside className={`lab-equipment ${panel === 'equipment' ? 'mobile-open' : ''}`}>
          <h2>Equipment</h2>
          <p className="lab-muted">캔버스로 드래그하거나 클릭해서 추가하세요.</p>
          {kinds.map((kind) => (
            <button
              key={kind}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/netlab-device', kind)}
              onClick={() => add(kind)}
              className="lab-equipment-item"
            >
              <span>
                {kind === 'router' ? '⇄' : kind === 'switch' ? '⋈' : kind === 'server' ? '▤' : '▣'}
              </span>
              Add {kind === 'pc' ? 'PC' : kind}
            </button>
          ))}
          <hr />
          <button onClick={undo} disabled={!history.past.length}>
            Undo
          </button>
          <button onClick={redo} disabled={!history.future.length}>
            Redo
          </button>
          <button onClick={duplicate} disabled={!document.devices.some((d) => d.id === selected)}>
            Duplicate
          </button>
          <button onClick={remove} disabled={!selected}>
            Delete selected
          </button>
          <p className="lab-muted">
            ⌘/Ctrl Z undo
            <br />
            ⌘/Ctrl D duplicate
            <br />
            Delete removes selection
          </p>
          <label className="lab-field">
            Project name
            <input
              value={document.name}
              onChange={(e) => replace({ ...document, name: e.target.value })}
            />
          </label>
          <label className="lab-field">
            Random seed
            <input
              type="number"
              value={document.seed}
              onChange={(e) => replace({ ...document, seed: Number(e.target.value) })}
            />
          </label>
        </aside>
        <section
          className="lab-canvas"
          aria-label="Network topology"
          data-testid="topology-canvas"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            e.preventDefault()
            const kind = e.dataTransfer.getData('application/netlab-device') as DeviceKind
            if (kinds.includes(kind))
              add(kind, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
          }}
        >
          <div className="lab-canvas-meta">
            <span>
              {running ? 'Running' : 'Paused'} · {(snapshot.nowUs / 1000000).toFixed(3)} s
            </span>
            <span>
              {snapshot.pendingEvents} queued · {document.devices.length} devices
            </span>
          </div>
          <ReactFlow<DeviceNode, WireEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onChanges}
            onNodeDragStop={(_, node) =>
              replace({
                ...document,
                devices: document.devices.map((d) =>
                  d.id === node.id ? { ...d, position: node.position } : d,
                ),
              })
            }
            onConnect={connect}
            connectionMode={ConnectionMode.Loose}
            onNodeClick={(_, node) => {
              setSelected(node.id)
              setEvent(undefined)
            }}
            onEdgeClick={(_, edge) => {
              setSelected(edge.id)
              setEvent(undefined)
            }}
            onPaneClick={() => {
              setSelected('')
              setEvent(undefined)
            }}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.15}
            maxZoom={2}
            colorMode="dark"
          >
            <Background color="#344653" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {!document.devices.length && (
            <div className="lab-empty">
              네트워크 만들기
              <br />
              <span>장치를 추가하고 포트 핸들을 연결하세요.</span>
            </div>
          )}
        </section>
        <aside className={`lab-inspector ${panel === 'inspector' ? 'mobile-open' : ''}`}>
          <Inspector
            key={`${selected}-${JSON.stringify(document.devices.find((d) => d.id === selected))}-${JSON.stringify(document.links.find((l) => l.id === selected))}`}
            device={document.devices.find((d) => d.id === selected)}
            link={document.links.find((l) => l.id === selected)}
            snapshot={snapshot}
            event={event}
            applyDevice={(device) =>
              replace({
                ...document,
                devices: document.devices.map((d) => (d.id === device.id ? device : d)),
              })
            }
            applyLink={(link) =>
              replace({
                ...document,
                links: document.links.map((l) => (l.id === link.id ? link : l)),
              })
            }
            runtime={(action, id, up, port) => {
              if (action === 'power') simulation.setPower(id, up)
              else if (action === 'link') simulation.setLinkState(id, up)
              else if (port) simulation.setInterfaceState(id, port, up)
              refresh()
            }}
          />
        </aside>
        <section className={`lab-console ${panel === 'console' ? 'mobile-open' : ''}`}>
          <div className="lab-terminal">
            <div className="lab-console-heading">
              <h2>Terminal</h2>
              <select
                aria-label="Terminal device"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {document.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="lab-terminal-output" role="log" aria-label="Command output">
              {snapshot.terminal
                .filter((t) => t.deviceId === source)
                .slice(-150)
                .map((line) => (
                  <div key={line.id}>
                    <span>{(line.timeUs / 1000).toFixed(1)}</span> {line.text}
                  </div>
                ))}
              {!snapshot.terminal.length && (
                <p className="lab-muted">ping을 실행한 뒤 Play 또는 Step으로 패킷을 확인하세요.</p>
              )}
            </div>
            <form
              className="lab-command"
              onSubmit={(e) => {
                e.preventDefault()
                submitCommand(command)
              }}
            >
              <span aria-hidden="true">❯</span>
              <input
                aria-label="Terminal command"
                data-testid="terminal-input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Enter a command or help"
                autoComplete="off"
              />
              <button type="submit" disabled={!source || !command.trim()}>
                Run command
              </button>
            </form>
            <details className="lab-help">
              <summary>Command help</summary>
              <code>
                help · ping &lt;ip&gt; · traceroute &lt;ip&gt; · arp · route · ipconfig · dhcp ·
                nslookup &lt;name&gt; · udp-send · tcp-connect · tcp-send · tcp-close · http-get
              </code>
              <button onClick={() => submitCommand('help')}>Show engine help</button>
            </details>
          </div>
          <div className="lab-timeline">
            <div className="lab-console-heading">
              <h2>Event timeline</h2>
              <select
                aria-label="Protocol filter"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
              >
                {['All', 'ARP', 'ICMP', 'TCP', 'UDP', 'DNS', 'DHCP', 'Routing', 'System'].map(
                  (p) => (
                    <option key={p}>{p}</option>
                  ),
                )}
              </select>
              <select
                aria-label="Event device filter"
                value={deviceFilter}
                onChange={(e) => setDeviceFilter(e.target.value)}
              >
                <option>All</option>
                {document.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <label className="lab-check">
                <input
                  type="checkbox"
                  checked={dropsOnly}
                  onChange={(e) => setDropsOnly(e.target.checked)}
                />
                Drops
              </label>
            </div>
            <div className="lab-event-list" role="log" aria-label="Simulation events">
              {visibleEvents.map((t) => (
                <button
                  key={t.id}
                  className={`lab-event ${event?.id === t.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    setEvent(t)
                    if (t.deviceId) setSelected(t.deviceId)
                    setPanel('inspector')
                  }}
                >
                  <time>{(t.timeUs / 1000).toFixed(2)}</time>
                  <span className={`lab-protocol protocol-${t.protocol}`}>{t.protocol}</span>
                  <span>
                    {t.message}
                    {t.reason ? ` (${t.reason})` : ''}
                  </span>
                </button>
              ))}
              {!visibleEvents.length && (
                <p className="lab-muted">
                  일치하는 이벤트가 없습니다. 명령을 실행해 프로토콜 기록을 확인하세요.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
export default function ProtocolLab() {
  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  )
}
