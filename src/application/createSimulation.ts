import type { NetworkDocument } from '../core/contracts'
import { Simulation } from '../core/simulation/Simulation'
import { createServicesExtension } from '../core/protocols/services'

/** Compose the fixed educational protocols without coupling the core to the UI. */
export function createSimulation(document: NetworkDocument) {
  return new Simulation(document, [createServicesExtension()])
}
