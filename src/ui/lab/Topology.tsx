import { useEffect, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getStraightPath,
  useUpdateNodeInternals,
} from '@xyflow/react'
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react'
import type { DeviceConfig, LinkConfig, Transmission } from '../../core/contracts'
export type DeviceNode = Node<
  { device: DeviceConfig; highlighted: boolean; connectedPorts: string[]; rightPorts: string[] },
  'device'
>
export type WireEdge = Edge<
  { link: LinkConfig; packets: Transmission[]; nowUs: number; inspect: (p: Transmission) => void },
  'wire'
>
export function DeviceView({ data, selected }: NodeProps<DeviceNode>) {
  const d = data.device
  const [expanded, setExpanded] = useState(false)
  const updateInternals = useUpdateNodeInternals()
  const ports = d.interfaces.filter(
    (port, index) => expanded || index < 2 || !!port.ip || data.connectedPorts.includes(port.id),
  )
  return (
    <div
      className={`lab-device ${selected || data.highlighted ? 'is-selected' : ''} ${d.powered ? '' : 'is-off'}`}
      data-testid={`device-${d.id}`}
    >
      <div className="lab-device-kind">
        {d.kind === 'router' ? '⇄' : d.kind === 'switch' ? '⋈' : d.kind === 'server' ? '▤' : '▣'}{' '}
        {d.kind}
        <span>{d.powered ? '●' : '○'}</span>
      </div>
      <strong>{d.name}</strong>
      {ports.map((p, i) => (
        <div className="lab-port" key={p.id}>
          <Handle
            type="source"
            position={
              (
                data.connectedPorts.includes(p.id)
                  ? data.rightPorts.includes(p.id)
                  : d.kind === 'pc' || d.interfaces.indexOf(p) % 2 === 1
              )
                ? Position.Right
                : Position.Left
            }
            id={p.id}
            style={{ top: 65 + i * 29 }}
            aria-label={`${d.name} ${p.name} port`}
          />
          <span>{p.name}</span>
          <code>
            {p.ip
              ? `${p.ip}/${p.prefix ?? 24}`
              : d.kind === 'switch'
                ? 'Ethernet'
                : p.mode === 'dhcp'
                  ? 'DHCP'
                  : 'Unconfigured'}
          </code>
          <i title={p.up ? 'Interface up' : 'Interface down'}>{p.up ? '●' : '○'}</i>
        </div>
      ))}
      {d.interfaces.length > 2 && (
        <button
          type="button"
          className="lab-ports-toggle nodrag nopan"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded(!expanded)
            requestAnimationFrame(() => updateInternals(d.id))
          }}
        >
          {expanded ? '사용 포트만 보기' : `전체 ${d.interfaces.length}개 포트`}
        </button>
      )}
    </div>
  )
}
export function WireView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<WireEdge>) {
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const [path, x, y] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  if (!data) return null
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: !data.link.up ? '#d17979' : selected ? '#b7dcf5' : '#688da5',
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: data.link.up ? undefined : '6 5',
        }}
      />
      <EdgeLabelRenderer>
        <span
          className="lab-wire-label"
          style={{ transform: `translate(-50%, -50%) translate(${x}px,${y}px)` }}
        >
          {data.link.up ? `${data.link.latencyMs} ms` : 'Link down'}
        </span>
        {data.packets.map((packet) => {
          const forward = packet.fromDeviceId === data.link.a.deviceId
          const t = Math.max(
            0,
            Math.min(
              1,
              (data.nowUs - packet.startUs) / Math.max(1, packet.arrivalUs - packet.startUs),
            ),
          )
          const progress = reducedMotion ? 0.5 : forward ? t : 1 - t
          return (
            <button
              type="button"
              key={packet.id}
              className={`lab-packet nodrag nopan protocol-${packet.protocol}`}
              aria-label={`Inspect ${packet.protocol} packet`}
              style={{
                transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) * progress}px,${sourceY + (targetY - sourceY) * progress}px)`,
              }}
              onClick={(e) => {
                e.stopPropagation()
                data.inspect(packet)
              }}
            >
              {packet.protocol}
            </button>
          )
        })}
      </EdgeLabelRenderer>
    </>
  )
}
