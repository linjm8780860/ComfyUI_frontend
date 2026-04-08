export const RUNTIME_CACHE_GROUPS = ['pages', 'static', 'data'] as const

export type RuntimeCacheGroup = (typeof RUNTIME_CACHE_GROUPS)[number]

export const PURGE_RUNTIME_CACHES_MESSAGE = 'PURGE_RUNTIME_CACHES'

const RUNTIME_CACHE_PREFIXES: Record<RuntimeCacheGroup, string> = {
  pages: 'comfyui-frontend-pages',
  static: 'comfyui-frontend-static',
  data: 'comfyui-frontend-data'
}

const runtimeCacheGroupSet = new Set<string>(RUNTIME_CACHE_GROUPS)

export function getRuntimeCacheVersion(): string {
  return __COMFYUI_SW_CACHE_VERSION__
}

export function getRuntimeCacheName(group: RuntimeCacheGroup): string {
  return `${RUNTIME_CACHE_PREFIXES[group]}-${getRuntimeCacheVersion()}`
}

export function getRuntimeCacheNames(): string[] {
  return RUNTIME_CACHE_GROUPS.map((group) => getRuntimeCacheName(group))
}

export function getRuntimeCachePrefix(group: RuntimeCacheGroup): string {
  return RUNTIME_CACHE_PREFIXES[group]
}

export function getRuntimeCachePrefixes(): string[] {
  return RUNTIME_CACHE_GROUPS.map((group) => getRuntimeCachePrefix(group))
}

export function isRuntimeCacheGroup(value: string): value is RuntimeCacheGroup {
  return runtimeCacheGroupSet.has(value)
}

export function normalizeRuntimeCacheGroups(
  groups?: readonly string[] | null
): RuntimeCacheGroup[] {
  if (!groups?.length) return [...RUNTIME_CACHE_GROUPS]

  const normalized = groups.filter((group) => isRuntimeCacheGroup(group))
  return normalized.length ? normalized : [...RUNTIME_CACHE_GROUPS]
}

export function isOutdatedRuntimeCacheName(cacheName: string): boolean {
  const activeCacheNames = new Set(getRuntimeCacheNames())

  if (activeCacheNames.has(cacheName)) return false

  return getRuntimeCachePrefixes().some(
    (prefix) => cacheName === prefix || cacheName.startsWith(`${prefix}-`)
  )
}
