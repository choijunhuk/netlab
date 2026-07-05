// ★ React-free zone (§8). Stop-and-wait TCP model (§6.5): one data packet in
// flight, ACK returns on the reverse path, timeout retransmits the same seq
// over a freshly computed route (that reroute is the demo highlight).
// Simplifications: no handshake, no windows, no congestion control.
import { nanoid } from 'nanoid'
import { shortestRoute } from '../algorithms/dijkstra'
import { linkBetween } from '../algorithms/graph'
import {
  TCP_MAX_RETRIES,
  TCP_PACKET_COUNT,
  TCP_TIMEOUT_BASE_MS,
  TCP_TIMEOUT_MULTIPLIER,
} from '../constants'
import type { NetLink, NetNode } from '../types/network'
import type { LogEntry, Packet } from '../types/simulation'

interface Topology {
  nodes: NetNode[]
  links: NetLink[]
}

interface TcpSession {
  id: string
  sourceId: string
  destId: string
  currentSeq: number
  retryCount: number
  timeoutAt: number // sim tick; Infinity while nothing awaited
  state: 'sending' | 'done' | 'failed'
}

/** Packets to inject + log lines produced by one state-machine transition. */
export interface TcpOutput {
  packets: Packet[]
  logs: LogEntry[]
}

let sessions: TcpSession[] = []

export function resetTcpSessions(): void {
  sessions = []
}

export function tcpSessionsActive(): boolean {
  return sessions.some((s) => s.state === 'sending')
}

const label = (topo: Topology, id: string) =>
  topo.nodes.find((n) => n.id === id)?.label ?? id

const pathDelay = (topo: Topology, path: string[]) => {
  let sum = 0
  for (let i = 0; i < path.length - 1; i++) sum += linkBetween(topo.links, path[i], path[i + 1])?.delayMs ?? 0
  return sum
}

/** Send (or resend) the session's current seq over a freshly computed route. */
function sendCurrentSeq(session: TcpSession, topo: Topology, tick: number): TcpOutput {
  const logs: LogEntry[] = []
  const path = shortestRoute(topo.nodes, topo.links, session.sourceId, session.destId)
  if (!path || path.length < 2) {
    session.state = 'failed'
    return {
      packets: [],
      logs: [{ tick, level: 'error', message: `[TCP] seq=${session.currentSeq}: no route — connection failed` }],
    }
  }
  session.timeoutAt = tick + pathDelay(topo, path) * TCP_TIMEOUT_MULTIPLIER + TCP_TIMEOUT_BASE_MS
  const retry = session.retryCount > 0 ? ` (retry ${session.retryCount}/${TCP_MAX_RETRIES})` : ''
  logs.push({
    tick,
    level: 'info',
    message: `[TCP] seq=${session.currentSeq} sent${retry} via ${path.map((id) => label(topo, id)).join(' → ')}`,
  })
  return {
    packets: [
      {
        id: nanoid(8),
        seq: session.currentSeq,
        kind: 'data',
        protocol: 'tcp',
        sourceId: session.sourceId,
        destId: session.destId,
        path,
        hopIndex: 0,
        progress: 0,
        status: session.retryCount > 0 ? 'retransmitting' : 'in-transit',
        retryCount: session.retryCount,
        sessionId: session.id,
      },
    ],
    logs,
  }
}

export function startTcpTransfer(
  topo: Topology,
  tick: number,
  sourceId: string,
  destId: string,
): TcpOutput {
  const session: TcpSession = {
    id: nanoid(6),
    sourceId,
    destId,
    currentSeq: 0,
    retryCount: 0,
    timeoutAt: Infinity,
    state: 'sending',
  }
  sessions.push(session)
  const out = sendCurrentSeq(session, topo, tick)
  return {
    packets: out.packets,
    logs: [
      {
        tick,
        level: 'info',
        message: `[TCP] ${label(topo, sourceId)} → ${label(topo, destId)}: transfer of ${TCP_PACKET_COUNT} packets (stop-and-wait)`,
      },
      ...out.logs,
    ],
  }
}

/** Data packet reached its destination → return an ACK on the reverse path. */
export function onTcpDataDelivered(topo: Topology, tick: number, p: Packet): TcpOutput {
  return {
    packets: [
      {
        id: nanoid(8),
        seq: p.seq,
        kind: 'ack',
        protocol: 'tcp',
        sourceId: p.destId,
        destId: p.sourceId,
        path: [...p.path].reverse(),
        hopIndex: 0,
        progress: 0,
        status: 'in-transit',
        retryCount: 0,
        sessionId: p.sessionId,
      },
    ],
    logs: [
      {
        tick,
        level: 'info',
        message: `[TCP] seq=${p.seq} delivered to ${label(topo, p.destId)}, ACK sent back`,
      },
    ],
  }
}

/** ACK reached the sender → advance stop-and-wait, or finish. */
export function onTcpAckDelivered(topo: Topology, tick: number, p: Packet): TcpOutput {
  const session = sessions.find((s) => s.id === p.sessionId)
  if (!session || session.state !== 'sending' || p.seq !== session.currentSeq) {
    return {
      packets: [],
      logs: [{ tick, level: 'info', message: `[TCP] stale ACK seq=${p.seq} ignored` }],
    }
  }
  const logs: LogEntry[] = [{ tick, level: 'info', message: `[TCP] ACK seq=${p.seq} received` }]
  session.currentSeq += 1
  session.retryCount = 0
  session.timeoutAt = Infinity
  if (session.currentSeq >= TCP_PACKET_COUNT) {
    session.state = 'done'
    logs.push({
      tick,
      level: 'info',
      message: `[TCP] transfer complete (${TCP_PACKET_COUNT}/${TCP_PACKET_COUNT} ACKed)`,
    })
    return { packets: [], logs }
  }
  const out = sendCurrentSeq(session, topo, tick)
  return { packets: out.packets, logs: [...logs, ...out.logs] }
}

/** Fire timeouts: retransmit the awaited seq, or give up after max retries. */
export function checkTcpTimeouts(topo: Topology, tick: number): TcpOutput {
  const packets: Packet[] = []
  const logs: LogEntry[] = []
  for (const session of sessions) {
    if (session.state !== 'sending' || tick < session.timeoutAt) continue
    session.retryCount += 1
    if (session.retryCount > TCP_MAX_RETRIES) {
      session.state = 'failed'
      logs.push({
        tick,
        level: 'error',
        message: `[TCP] seq=${session.currentSeq}: no ACK after ${TCP_MAX_RETRIES} retries — connection failed`,
      })
      continue
    }
    logs.push({
      tick,
      level: 'warn',
      message: `[TCP] seq=${session.currentSeq} timeout, retransmitting (${session.retryCount}/${TCP_MAX_RETRIES})`,
    })
    const out = sendCurrentSeq(session, topo, tick)
    packets.push(...out.packets)
    logs.push(...out.logs)
  }
  return { packets, logs }
}
