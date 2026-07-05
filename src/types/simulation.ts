export type PacketStatus = 'in-transit' | 'delivered' | 'lost' | 'retransmitting'

export interface Packet {
  id: string
  seq: number // TCP sequence number (step 8)
  kind: 'data' | 'ack'
  protocol: 'tcp' | 'udp'
  sourceId: string
  destId: string
  path: string[] // node ids, frozen at send time
  hopIndex: number // which link of the path is being crossed
  progress: number // 0..1 within the current link
  status: PacketStatus
  retryCount: number
  sessionId?: string // TCP: owning tcpSession
}

export interface LogEntry {
  tick: number
  level: 'info' | 'warn' | 'error'
  message: string
}
