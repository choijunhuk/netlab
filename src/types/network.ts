export type NodeType = 'client' | 'router' | 'server'

export interface NetNode {
  id: string
  type: NodeType
  label: string
  position: { x: number; y: number }
  isDown: boolean
}

export interface NetLink {
  id: string
  sourceId: string
  targetId: string // undirected — traffic flows both ways
  cost: number
  delayMs: number
  lossRate: number // 0..1
  isDown: boolean
}
