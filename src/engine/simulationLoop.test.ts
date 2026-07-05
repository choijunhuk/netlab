import { beforeEach, describe, expect, it } from 'vitest'
import { useNetworkStore } from '../store/useNetworkStore'
import { useSimulationStore } from '../store/useSimulationStore'
import { sendUdpPacket, setRngSeed, stepSimulation } from './simulationLoop'

const netInitial = useNetworkStore.getInitialState()
const simInitial = useSimulationStore.getInitialState()

/** Client A — Router 1 — Server 1 chain, delay 100ms per link. */
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
  return { a, r, srv }
}

describe('stepSimulation', () => {
  beforeEach(() => {
    useNetworkStore.setState(netInitial, true)
    useSimulationStore.setState(simInitial, true)
  })

  it('moves a packet across hops and delivers it', () => {
    buildChain()
    sendUdpPacket()
    expect(useSimulationStore.getState().packets).toHaveLength(1)

    stepSimulation(50) // half of first link
    let p = useSimulationStore.getState().packets[0]
    expect(p.hopIndex).toBe(0)
    expect(p.progress).toBeCloseTo(0.5)

    stepSimulation(60) // crosses into second link
    p = useSimulationStore.getState().packets[0]
    expect(p.hopIndex).toBe(1)
    expect(p.progress).toBe(0)

    stepSimulation(110) // finishes second link → delivered
    const sim = useSimulationStore.getState()
    expect(sim.packets).toHaveLength(0)
    expect(sim.isRunning).toBe(false)
    expect(sim.logs.at(-1)?.message).toContain('delivered')
  })

  it('drops a packet when its current link goes down', () => {
    buildChain()
    sendUdpPacket()
    const linkId = useSimulationStore.getState().packets[0].path
    void linkId
    // kill first link mid-flight
    const l = useNetworkStore.getState().links[0]
    useNetworkStore.setState((s) => ({
      links: s.links.map((x) => (x.id === l.id ? { ...x, isDown: true } : x)),
    }))
    stepSimulation(10)
    const sim = useSimulationStore.getState()
    expect(sim.packets).toHaveLength(0)
    expect(sim.logs.at(-1)?.message).toContain('dropped')
  })

  it('loses packets on a lossRate=1 link and fades them out', () => {
    buildChain()
    setRngSeed(1)
    const l = useNetworkStore.getState().links[0]
    useNetworkStore.getState().updateLink(l.id, { lossRate: 1 })
    sendUdpPacket()

    stepSimulation(10) // loss judged at hop start
    let sim = useSimulationStore.getState()
    expect(sim.packets[0].status).toBe('lost')
    expect(sim.logs.at(-1)?.message).toContain('lost')

    stepSimulation(200) // fade completes → packet removed
    sim = useSimulationStore.getState()
    expect(sim.packets).toHaveLength(0)
    expect(sim.isRunning).toBe(false)
  })

  it('never loses packets when lossRate is 0', () => {
    buildChain()
    setRngSeed(1)
    sendUdpPacket()
    for (let i = 0; i < 30; i++) stepSimulation(10)
    expect(useSimulationStore.getState().logs.at(-1)?.message).toContain('delivered')
  })

  it('refuses to send when no route exists', () => {
    const s = useNetworkStore.getState()
    s.addNode('client')
    s.addNode('server')
    const [a, srv] = useNetworkStore.getState().nodes
    useSimulationStore.getState().setTransferSource(a.id)
    useSimulationStore.getState().setTransferDest(srv.id)
    sendUdpPacket()
    const sim = useSimulationStore.getState()
    expect(sim.packets).toHaveLength(0)
    expect(sim.logs.at(-1)?.message).toContain('no route')
  })
})
