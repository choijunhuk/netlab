import { useState } from 'react'
import type {
  DeviceConfig,
  LinkConfig,
  SimulationSnapshot,
  TraceRecord,
} from '../../core/contracts'

type Row = Record<string, unknown>
function Table({ rows }: { rows: Row[] }) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  return rows.length ? (
    <div className="lab-table-scroll">
      <table>
        <thead>
          <tr>
            {keys.map((key) => (
              <th key={key}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {keys.map((key) => (
                <td key={key}>{String(row[key] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="lab-muted">항목 없음</p>
  )
}
function Field({
  label,
  value,
  onChange,
  number = false,
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  number?: boolean
}) {
  return (
    <label className="lab-field">
      {label}
      <input
        type={number ? 'number' : 'text'}
        step={number ? 'any' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
export function Inspector({
  device,
  link,
  snapshot,
  event,
  applyDevice,
  applyLink,
  runtime,
}: {
  device?: DeviceConfig
  link?: LinkConfig
  snapshot: SimulationSnapshot
  event?: TraceRecord
  applyDevice: (d: DeviceConfig) => void
  applyLink: (l: LinkConfig) => void
  runtime: (action: 'power' | 'interface' | 'link', id: string, up: boolean, port?: string) => void
}) {
  const [draft, setDraft] = useState(device ? structuredClone(device) : undefined)
  const [wire, setWire] = useState(link ? structuredClone(link) : undefined)
  const [records, setRecords] = useState(
    Object.entries(device?.dnsRecords ?? {}).map(([name, ip]) => ({ name, ip })),
  )
  const live = snapshot.devices.find((d) => d.id === device?.id)
  const liveLink = snapshot.links.find((l) => l.id === link?.id)
  const dhcp = draft?.dhcp ?? {
    enabled: false,
    start: '192.168.1.100',
    end: '192.168.1.200',
    prefix: 24,
    gateway: '192.168.1.1',
    dns: '192.168.1.1',
    leaseSeconds: 3600,
  }
  const nat = draft?.nat ?? { enabled: false, inside: [], outside: '' }
  const packet = event?.frame && 'ttl' in event.frame.payload ? event.frame.payload : undefined
  return (
    <>
      <h2>Inspector · 설정 및 상태</h2>
      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            applyDevice({
              ...draft,
              dnsRecords: Object.fromEntries(records.map((r) => [r.name, r.ip])),
            })
          }}
        >
          <div className="lab-section-title">저장할 설정 · {draft.kind}</div>
          <Field
            label="Device name"
            value={draft.name}
            onChange={(name) => setDraft({ ...draft, name })}
          />
          {draft.interfaces.map((port, index) => (
            <fieldset key={port.id}>
              <legend>{port.name}</legend>
              <div className="lab-mono lab-muted">{port.mac}</div>
              <label className="lab-check">
                <input
                  type="checkbox"
                  checked={port.up}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      interfaces: draft.interfaces.map((p, i) =>
                        i === index ? { ...p, up: e.target.checked } : p,
                      ),
                    })
                  }
                />
                Configured up
              </label>
              {draft.kind !== 'switch' && (
                <>
                  <label className="lab-field">
                    Address mode
                    <select
                      value={port.mode}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          interfaces: draft.interfaces.map((p, i) =>
                            i === index ? { ...p, mode: e.target.value as 'static' | 'dhcp' } : p,
                          ),
                        })
                      }
                    >
                      <option value="static">Static</option>
                      <option value="dhcp">DHCP</option>
                    </select>
                  </label>
                  {(['ip', 'prefix', 'gateway', 'dns'] as const).map((key) => (
                    <Field
                      key={key}
                      label={
                        {
                          ip: 'IPv4 address',
                          prefix: 'Prefix length',
                          gateway: 'Default gateway',
                          dns: 'DNS server',
                        }[key]
                      }
                      number={key === 'prefix'}
                      value={port[key] ?? ''}
                      onChange={(value) =>
                        setDraft({
                          ...draft,
                          interfaces: draft.interfaces.map((p, i) =>
                            i === index
                              ? {
                                  ...p,
                                  [key]:
                                    value === ''
                                      ? undefined
                                      : key === 'prefix'
                                        ? Number(value)
                                        : value,
                                }
                              : p,
                          ),
                        })
                      }
                    />
                  ))}
                </>
              )}
            </fieldset>
          ))}
          {draft.kind !== 'switch' && (
            <>
              <details>
                <summary>Static routes · 정적 경로</summary>
                {draft.routes.map((route, index) => (
                  <fieldset key={index}>
                    <legend>경로 {index + 1}</legend>
                    {(['network', 'prefix', 'gateway', 'metric'] as const).map((key) => (
                      <Field
                        key={key}
                        label={`Route ${key}`}
                        number={key === 'prefix' || key === 'metric'}
                        value={route[key] ?? ''}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            routes: draft.routes.map((r, i) =>
                              i === index
                                ? {
                                    ...r,
                                    [key]:
                                      key === 'prefix' || key === 'metric'
                                        ? Number(value)
                                        : value || undefined,
                                  }
                                : r,
                            ),
                          })
                        }
                      />
                    ))}
                    <label className="lab-field">
                      Route interface
                      <select
                        value={route.interfaceId}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            routes: draft.routes.map((r, i) =>
                              i === index ? { ...r, interfaceId: e.target.value } : r,
                            ),
                          })
                        }
                      >
                        {draft.interfaces.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, routes: draft.routes.filter((_, i) => i !== index) })
                      }
                    >
                      Remove route
                    </button>
                  </fieldset>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      routes: [
                        ...draft.routes,
                        {
                          network: '0.0.0.0',
                          prefix: 0,
                          interfaceId: draft.interfaces[0]?.id ?? '',
                          metric: 1,
                        },
                      ],
                    })
                  }
                >
                  Add route
                </button>
              </details>
              <details>
                <summary>DHCP server · 주소 할당</summary>
                <label className="lab-check">
                  <input
                    type="checkbox"
                    checked={dhcp.enabled}
                    onChange={(e) =>
                      setDraft({ ...draft, dhcp: { ...dhcp, enabled: e.target.checked } })
                    }
                  />
                  Enable DHCP server
                </label>
                {(['start', 'end', 'prefix', 'gateway', 'dns', 'leaseSeconds'] as const).map(
                  (key) => (
                    <Field
                      key={key}
                      label={
                        {
                          start: 'DHCP pool start',
                          end: 'DHCP pool end',
                          prefix: 'DHCP prefix',
                          gateway: 'DHCP gateway',
                          dns: 'DHCP DNS',
                          leaseSeconds: 'Lease seconds',
                        }[key]
                      }
                      number={key === 'prefix' || key === 'leaseSeconds'}
                      value={dhcp[key]}
                      onChange={(value) =>
                        setDraft({
                          ...draft,
                          dhcp: {
                            ...dhcp,
                            [key]:
                              key === 'prefix' || key === 'leaseSeconds' ? Number(value) : value,
                          },
                        })
                      }
                    />
                  ),
                )}
              </details>
              <details>
                <summary>DNS A records · 이름 해석</summary>
                {records.map((record, i) => (
                  <fieldset key={i}>
                    <legend>A record {i + 1}</legend>
                    <Field
                      label="DNS hostname"
                      value={record.name}
                      onChange={(name) =>
                        setRecords((rows) =>
                          rows.map((r, index) => (index === i ? { ...r, name } : r)),
                        )
                      }
                    />
                    <Field
                      label="DNS IPv4 address"
                      value={record.ip}
                      onChange={(ip) =>
                        setRecords((rows) =>
                          rows.map((r, index) => (index === i ? { ...r, ip } : r)),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setRecords((rows) => rows.filter((_, index) => index !== i))}
                    >
                      Remove record
                    </button>
                  </fieldset>
                ))}
                <button
                  type="button"
                  onClick={() => setRecords((rows) => [...rows, { name: '', ip: '' }])}
                >
                  Add DNS record
                </button>
              </details>
              <details>
                <summary>UDP / TCP / HTTP services</summary>
                {(['udpEcho', 'tcpEcho'] as const).map((key) => (
                  <Field
                    key={key}
                    label={key === 'udpEcho' ? 'UDP echo port' : 'TCP echo port'}
                    number
                    value={draft.services?.[key] ?? ''}
                    onChange={(value) =>
                      setDraft({
                        ...draft,
                        services: { ...draft.services, [key]: value ? Number(value) : undefined },
                      })
                    }
                  />
                ))}
                <label className="lab-check">
                  <input
                    type="checkbox"
                    checked={draft.services?.http ?? false}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        services: { ...draft.services, http: e.target.checked },
                      })
                    }
                  />
                  Enable HTTP service
                </label>
              </details>
              <details>
                <summary>NAT / PAT · 주소 변환</summary>
                <label className="lab-check">
                  <input
                    type="checkbox"
                    checked={nat.enabled}
                    onChange={(e) =>
                      setDraft({ ...draft, nat: { ...nat, enabled: e.target.checked } })
                    }
                  />
                  Enable NAT
                </label>
                <p className="lab-muted">Inside interfaces · 내부 포트</p>
                {draft.interfaces.map((p) => (
                  <label className="lab-check" key={p.id}>
                    <input
                      type="checkbox"
                      checked={nat.inside.includes(p.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          nat: {
                            ...nat,
                            inside: e.target.checked
                              ? [...nat.inside, p.id]
                              : nat.inside.filter((id) => id !== p.id),
                          },
                        })
                      }
                    />
                    {p.name}
                  </label>
                ))}
                <label className="lab-field">
                  Outside interface
                  <select
                    value={nat.outside}
                    onChange={(e) =>
                      setDraft({ ...draft, nat: { ...nat, outside: e.target.value } })
                    }
                  >
                    <option value="">포트 선택</option>
                    {draft.interfaces.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </details>
            </>
          )}
          <button className="lab-primary" type="submit">
            Apply configuration & reset run
          </button>
          <p className="lab-muted">설정을 적용하면 실행과 패킷 기록이 초기화됩니다.</p>
        </form>
      )}
      {wire && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            applyLink(wire)
          }}
        >
          <div className="lab-section-title">Link configuration</div>
          {(['latencyMs', 'bandwidthMbps', 'lossPercent', 'queueCapacity'] as const).map((key) => (
            <Field
              key={key}
              label={
                {
                  latencyMs: 'Latency (ms)',
                  bandwidthMbps: 'Bandwidth (Mbps)',
                  lossPercent: 'Loss (%)',
                  queueCapacity: 'Queue capacity (frames)',
                }[key]
              }
              number
              value={wire[key]}
              onChange={(value) => setWire({ ...wire, [key]: Number(value) })}
            />
          ))}
          <label className="lab-check">
            <input
              type="checkbox"
              checked={wire.up}
              onChange={(e) => setWire({ ...wire, up: e.target.checked })}
            />
            Configured up
          </label>
          <button type="submit">Apply link & reset run</button>
        </form>
      )}
      {!draft && !wire && !event && (
        <p className="lab-muted">
          장치, 링크 또는 패킷을 선택하세요. 장치의 포트 핸들을 연결해 링크를 만듭니다.
        </p>
      )}
      {(live || liveLink) && (
        <section>
          <h3>Live failure controls</h3>
          <p className="lab-muted">
            현재 실행에만 적용됩니다. Reset하면 저장된 설정으로 돌아갑니다.
          </p>
          {live && (
            <>
              <button onClick={() => runtime('power', live.id, !live.powered)}>
                {live.powered ? 'Power off' : 'Power on'}
              </button>
              {live.interfaces.map((p) => (
                <button key={p.id} onClick={() => runtime('interface', live.id, !p.up, p.id)}>
                  {p.name}: {p.up ? 'disable' : 'enable'}
                </button>
              ))}
            </>
          )}
          {liveLink && (
            <button onClick={() => runtime('link', liveLink.id, !liveLink.up)}>
              {liveLink.up ? 'Disconnect link' : 'Restore link'}
            </button>
          )}
        </section>
      )}
      {event && (
        <section>
          <h3>Historical packet · 과거 기록</h3>
          <p>
            {event.protocol} · {(event.timeUs / 1000).toFixed(2)} ms
          </p>
          <p>{event.message}</p>
          <p className="lab-muted">
            이벤트 발생 시점의 헤더입니다. 아래 현재 상태 테이블과 구분하세요.
          </p>
          {event.frame && (
            <>
              <h3>Ethernet header</h3>
              <Table
                rows={[
                  {
                    source: event.frame.source,
                    destination: event.frame.destination,
                    type: event.frame.etherType,
                  },
                ]}
              />
            </>
          )}
          {packet && 'ttl' in packet && (
            <>
              <h3>IPv4 header</h3>
              <Table
                rows={[
                  {
                    source: packet.source,
                    destination: packet.destination,
                    TTL: packet.ttl,
                    flow: packet.flowId,
                  },
                ]}
              />
              <h3>{packet.payload.kind.toUpperCase()} header</h3>
              <Table rows={[packet.payload as unknown as Row]} />
            </>
          )}
          {event.before && event.after && (
            <>
              <h3>Before → After · 홉 변화</h3>
              <Table
                rows={[
                  { header: 'source', before: event.before.source, after: event.after.source },
                  {
                    header: 'destination',
                    before: event.before.destination,
                    after: event.after.destination,
                  },
                  { header: 'TTL', before: event.before.ttl, after: event.after.ttl },
                ]}
              />
            </>
          )}
          <details>
            <summary>Raw immutable headers</summary>
            <pre>
              {JSON.stringify(
                {
                  frame: event.frame,
                  before: event.before,
                  after: event.after,
                  reason: event.reason,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </section>
      )}
      {live && (
        <section>
          <h3>Live tables · 현재 {live.name}</h3>
          <details open>
            <summary>ARP cache</summary>
            <Table rows={(snapshot.arp[live.id] ?? []).map((r) => ({ ...r }))} />
          </details>
          <details>
            <summary>MAC table</summary>
            <Table rows={(snapshot.mac[live.id] ?? []).map((r) => ({ ...r }))} />
          </details>
          <details>
            <summary>Routing table</summary>
            <Table
              rows={[
                ...live.interfaces
                  .filter((p) => p.ip && p.prefix !== undefined)
                  .map((p) => ({
                    network: connectedNetwork(p.ip!, p.prefix!),
                    prefix: p.prefix,
                    interface: p.name,
                    type: 'connected',
                    gateway: '—',
                  })),
                ...live.routes.map((r) => ({ ...r, type: 'static' })),
              ]}
            />
          </details>
          {Object.entries(snapshot.tables)
            .filter(([key]) => key.endsWith(`:${live.id}`))
            .map(([key, rows]) => (
              <details key={key}>
                <summary>{key}</summary>
                <Table rows={rows} />
              </details>
            ))}
        </section>
      )}
    </>
  )
}
function connectedNetwork(ip: string, prefix: number) {
  const address = ip.split('.').reduce((n, part) => (n << 8) | Number(part), 0)
  const network = address & (prefix === 0 ? 0 : -1 << (32 - prefix))
  return [24, 16, 8, 0].map((shift) => (network >>> shift) & 255).join('.')
}
