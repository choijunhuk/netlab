import { beforeEach, describe, expect, it } from 'vitest'
import { useNetworkStore } from '../store/useNetworkStore'
import { useSimulationStore } from '../store/useSimulationStore'
import { sendTcpTransfer, setRngSeed, stepSimulation } from './simulationLoop'
import { resetTcpSessions, tcpSessionsActive } from './tcpSession'

const netInitial = useNetworkStore.getInitialState()
const simInitial = useSimulationStore.getInitialState()

/** Client A — Router 1 — Server 1 chain, 100ms per link (RTT 400ms, timeout 900ms). */
function buildChain() {
  const s = useNetworkStore.getState()
  s.addNode('client')
  s.addNode('router')
  s.addNode('server')
  const [a, r, srv] = useNetworkStore.getState().nodes
  s.clickNodeForLink(a.id)
  s.clickNodeForLink(r.id)
  s.clickNodeForLink(r.id)
  s.clickNodeForLink(srv.id)
  useSimulationStore.getState().setTransferSource(a.id)
  useSimulationStore.getState().setTransferDest(srv.id)
}

const run = (ms: number, step = 50) => {
  for (let t = 0; t < ms; t += step) stepSimulation(step)
}
const messages = () => useSimulationStore.getState().logs.map((l) => l.message)

describe('tcp session', () => {
  beforeEach(() => {
    useNetworkStore.setState(netInitial, true)
    useSimulationStore.setState(simInitial, true)
    resetTcpSessions()
    setRngSeed(1)
  })

  it('completes 3 seqs via stop-and-wait ACKs', () => {
    buildChain()
    sendTcpTransfer()
    run(2000)
    const msgs = messages()
    expect(msgs).toContain('[TCP] ACK seq=0 received')
    expect(msgs).toContain('[TCP] ACK seq=2 received')
    expect(msgs).toContain('[TCP] transfer complete (3/3 ACKed)')
    expect(tcpSessionsActive()).toBe(false)
    expect(useSimulationStore.getState().isRunning).toBe(false)
  })

  it('retransmits after loss, then completes once the link heals', () => {
    buildChain()
    const l = useNetworkStore.getState().links[0]
    useNetworkStore.getState().updateLink(l.id, { lossRate: 1 })
    sendTcpTransfer()
    run(1000) // seq=0 lost at t≈0, timeout at 900 → first retry
    expect(messages().some((m) => m.includes('timeout, retransmitting (1/3)'))).toBe(true)

    useNetworkStore.getState().updateLink(l.id, { lossRate: 0 })
    run(3000)
    expect(messages()).toContain('[TCP] transfer complete (3/3 ACKed)')
  })

  it('gives up after max retries', () => {
    buildChain()
    const l = useNetworkStore.getState().links[0]
    useNetworkStore.getState().updateLink(l.id, { lossRate: 1 })
    sendTcpTransfer()
    run(5000)
    const msgs = messages()
    expect(msgs.some((m) => m.includes('retransmitting (3/3)'))).toBe(true)
    expect(msgs.some((m) => m.includes('connection failed'))).toBe(true)
    expect(tcpSessionsActive()).toBe(false)
    expect(useSimulationStore.getState().isRunning).toBe(false)
  })

  it('retransmission reroutes around a dead link', () => {
    // direct r1—r2 plus detour r1—r3—r2 (§12 steps 7–8)
    const s = useNetworkStore.getState()
    s.addNode('client')
    s.addNode('router')
    s.addNode('router')
    s.addNode('router')
    s.addNode('server')
    const [a, r1, r2, r3, srv] = useNetworkStore.getState().nodes
    const pairs = [
      [a, r1],
      [r1, r2],
      [r1, r3],
      [r3, r2],
      [r2, srv],
    ] as const
    for (const [x, y] of pairs) {
      s.clickNodeForLink(x.id)
      s.clickNodeForLink(y.id)
    }
    useSimulationStore.getState().setTransferSource(a.id)
    useSimulationStore.getState().setTransferDest(srv.id)
    sendTcpTransfer()
    run(100) // packet is somewhere on the direct path
    const direct = useNetworkStore.getState().links.find(
      (l) =>
        (l.sourceId === r1.id && l.targetId === r2.id) ||
        (l.sourceId === r2.id && l.targetId === r1.id),
    )!
    useNetworkStore.getState().updateLink(direct.id, { isDown: true })
    run(6000)
    const msgs = messages()
    const rerouted = msgs.some(
      (m) => m.includes('sent (retry') && m.includes('Router 3'),
    )
    expect(rerouted).toBe(true)
    expect(msgs).toContain('[TCP] transfer complete (3/3 ACKed)')
  })
})
