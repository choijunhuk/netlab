import { beforeEach, describe, expect, it } from 'vitest'
import { canCreateLink, useNetworkStore } from './useNetworkStore'

const initial = useNetworkStore.getInitialState()

describe('useNetworkStore', () => {
  beforeEach(() => {
    useNetworkStore.setState(initial, true)
  })

  it('adds nodes with per-type auto numbering', () => {
    const { addNode } = useNetworkStore.getState()
    addNode('client')
    addNode('client')
    addNode('router')
    addNode('server')
    const labels = useNetworkStore.getState().nodes.map((n) => n.label)
    expect(labels).toEqual(['Client A', 'Client B', 'Router 1', 'Server 1'])
  })

  it('creates a link via two link-mode clicks', () => {
    const s = useNetworkStore.getState()
    s.addNode('client')
    s.addNode('router')
    const [a, b] = useNetworkStore.getState().nodes
    s.clickNodeForLink(a.id)
    s.clickNodeForLink(b.id)
    const { links, pendingLinkSource } = useNetworkStore.getState()
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ sourceId: a.id, targetId: b.id, cost: 1 })
    expect(pendingLinkSource).toBeNull()
  })

  it('removing a node removes its attached links', () => {
    const s = useNetworkStore.getState()
    s.addNode('client')
    s.addNode('router')
    const [a, b] = useNetworkStore.getState().nodes
    s.clickNodeForLink(a.id)
    s.clickNodeForLink(b.id)
    s.removeNodes([b.id])
    const { nodes, links } = useNetworkStore.getState()
    expect(nodes).toHaveLength(1)
    expect(links).toHaveLength(0)
  })
})

describe('canCreateLink', () => {
  const link = (sourceId: string, targetId: string) => ({
    id: 'x',
    sourceId,
    targetId,
    cost: 1,
    delayMs: 100,
    lossRate: 0,
    isDown: false,
  })

  it('rejects self-links', () => {
    expect(canCreateLink('a', 'a', [])).toBe(false)
  })

  it('rejects duplicates in either direction', () => {
    expect(canCreateLink('a', 'b', [link('a', 'b')])).toBe(false)
    expect(canCreateLink('b', 'a', [link('a', 'b')])).toBe(false)
  })

  it('allows a fresh pair', () => {
    expect(canCreateLink('a', 'c', [link('a', 'b')])).toBe(true)
  })
})
