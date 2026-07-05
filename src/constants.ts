export const DEFAULT_LINK_COST = 1
export const DEFAULT_LINK_DELAY_MS = 100
export const DEFAULT_LINK_LOSS_RATE = 0
export const MAX_FRAME_DELTA_MS = 100
export const DEFAULT_RNG_SEED = 1337
/** lost packets fade out and vanish mid-link (§6.4) */
export const LOST_PACKET_FADE_END = 0.5

// TCP simplified model (§6.5)
export const TCP_PACKET_COUNT = 3
export const TCP_MAX_RETRIES = 3
export const TCP_TIMEOUT_MULTIPLIER = 2 // × path round-trip delay
export const TCP_TIMEOUT_BASE_MS = 500
