import { beforeEach, describe, expect, it } from 'vitest'
import { useNetworkStore } from '../store/useNetworkStore'
import { DEMO_SCENARIO, applyScenario, currentScenario, isScenario } from './scenario'

const initial = useNetworkStore.getInitialState()

describe('scenario', () => {
  beforeEach(() => useNetworkStore.setState(initial, true))

  it('round-trips through apply/current', () => {
    applyScenario(DEMO_SCENARIO)
    expect(currentScenario()).toEqual(DEMO_SCENARIO)
    expect(useNetworkStore.getState().nodes).toHaveLength(5)
  })

  it('demo scenario passes its own validation', () => {
    expect(isScenario(DEMO_SCENARIO)).toBe(true)
    expect(isScenario(JSON.parse(JSON.stringify(DEMO_SCENARIO)))).toBe(true)
  })

  it('rejects malformed input', () => {
    expect(isScenario(null)).toBe(false)
    expect(isScenario({ nodes: [], links: [] })).toBe(false) // no counters
    expect(isScenario({ ...DEMO_SCENARIO, nodes: [{ id: 1 }] })).toBe(false)
  })
})
