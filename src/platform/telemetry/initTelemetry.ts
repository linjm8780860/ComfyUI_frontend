import { ref } from 'vue'
import type { TelemetryRegistry } from './TelemetryRegistry'

let _initPromise: Promise<void> | null = null
const _registry = ref<TelemetryRegistry | null>(null)

export function setTelemetryRegistry(registry: TelemetryRegistry) {
  _registry.value = registry
}

export function useTelemetry() {
  return _registry.value
}

export async function initTelemetry(): Promise<void> {
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const { TelemetryRegistry } = await import('./TelemetryRegistry')
    const registry = new TelemetryRegistry()
    setTelemetryRegistry(registry)
  })()

  return _initPromise
}
