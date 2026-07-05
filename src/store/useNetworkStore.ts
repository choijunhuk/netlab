import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { NetLink, NetNode, NodeType } from '../types/network'
import {
  DEFAULT_LINK_COST,
  DEFAULT_LINK_DELAY_MS,
  DEFAULT_LINK_LOSS_RATE,
} from '../constants'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function makeLabel(type: NodeType, seq: number): string {
  if (type === 'client') return `Client ${LETTERS[(seq - 1) % LETTERS.length]}`
  return `${type === 'router' ? 'Router' : 'Server'} ${seq}`
}

/**
 * Whether a new link sourceId→targetId may be created.
 * Links are undirected (§6.1): A–B and B–A are the same link, so duplicates
 * are checked in both orientations. Self-links never help a shortest path.
 * ponytail: parallel links with distinct costs rejected — buildGraph would
 * only ever use the cheaper one; allow them if that changes.
 */
export function canCreateLink(sourceId: string, targetId: string, links: NetLink[]): boolean {
  if (sourceId === targetId) return false
  return !links.some(
    (l) =>
      (l.sourceId === sourceId && l.targetId === targetId) ||
      (l.sourceId === targetId && l.targetId === sourceId),
  )
}

interface NetworkState {
  nodes: NetNode[]
  links: NetLink[]
  counters: Record<NodeType, number>
  linkMode: boolean
  pendingLinkSource: string | null
  selectedNodeIds: string[]
  selectedLinkIds: string[]

  addNode: (type: NodeType) => void
  moveNode: (id: string, position: { x: number; y: number }) => void
  removeNodes: (ids: string[]) => void
  removeLinks: (ids: string[]) => void
  setNodeSelected: (id: string, selected: boolean) => void
  setLinkSelected: (id: string, selected: boolean) => void
  toggleLinkMode: () => void
  clickNodeForLink: (nodeId: string) => void
}

export const useNetworkStore = create<NetworkState>((set) => ({
  nodes: [],
  links: [],
  counters: { client: 0, router: 0, server: 0 },
  linkMode: false,
  pendingLinkSource: null,
  selectedNodeIds: [],
  selectedLinkIds: [],

  addNode: (type) =>
    set((s) => {
      const seq = s.counters[type] + 1
      const i = s.nodes.length
      const node: NetNode = {
        id: nanoid(8),
        type,
        label: makeLabel(type, seq),
        position: { x: 140 + (i % 5) * 100, y: 120 + Math.floor(i / 5) * 100 },
        isDown: false,
      }
      return { nodes: [...s.nodes, node], counters: { ...s.counters, [type]: seq } }
    }),

  moveNode: (id, position) =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)) })),

  removeNodes: (ids) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => !ids.includes(n.id)),
      // links attached to a removed node die with it
      links: s.links.filter((l) => !ids.includes(l.sourceId) && !ids.includes(l.targetId)),
      selectedNodeIds: s.selectedNodeIds.filter((id) => !ids.includes(id)),
      pendingLinkSource:
        s.pendingLinkSource && ids.includes(s.pendingLinkSource) ? null : s.pendingLinkSource,
    })),

  removeLinks: (ids) =>
    set((s) => ({
      links: s.links.filter((l) => !ids.includes(l.id)),
      selectedLinkIds: s.selectedLinkIds.filter((id) => !ids.includes(id)),
    })),

  setNodeSelected: (id, selected) =>
    set((s) => ({
      selectedNodeIds: selected
        ? [...s.selectedNodeIds.filter((x) => x !== id), id]
        : s.selectedNodeIds.filter((x) => x !== id),
    })),

  setLinkSelected: (id, selected) =>
    set((s) => ({
      selectedLinkIds: selected
        ? [...s.selectedLinkIds.filter((x) => x !== id), id]
        : s.selectedLinkIds.filter((x) => x !== id),
    })),

  toggleLinkMode: () => set((s) => ({ linkMode: !s.linkMode, pendingLinkSource: null })),

  clickNodeForLink: (nodeId) =>
    set((s) => {
      if (!s.pendingLinkSource) return { pendingLinkSource: nodeId }
      const sourceId = s.pendingLinkSource
      if (!canCreateLink(sourceId, nodeId, s.links)) return { pendingLinkSource: null }
      const link: NetLink = {
        id: nanoid(8),
        sourceId,
        targetId: nodeId,
        cost: DEFAULT_LINK_COST,
        delayMs: DEFAULT_LINK_DELAY_MS,
        lossRate: DEFAULT_LINK_LOSS_RATE,
        isDown: false,
      }
      return { pendingLinkSource: null, links: [...s.links, link] }
    }),
}))
